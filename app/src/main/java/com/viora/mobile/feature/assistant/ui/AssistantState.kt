package com.viora.mobile.feature.assistant.ui

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.viora.mobile.core.model.*
import com.viora.mobile.core.operations.*
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*

data class AssistantState(
    val phase: String = "LOADING", val conversations: List<Conversation> = emptyList(),
    val conversation: Conversation? = null, val messages: List<Message> = emptyList(),
    val patients: List<Patient> = emptyList(), val encounters: List<Encounter> = emptyList(),
    val context: AssistantContext? = null, val target: ClinicalRecord? = null,
    val draft: AiDraft? = null, val drafts: List<AiDraft> = emptyList(),
    val input: String = "", val edit: ClinicalContent? = null, val busy: Boolean = false,
    val notice: String? = null, val pending: OperationReceipt? = null, val receipt: AssistantReceipt? = null,
    val evidence: HandoffEvidence? = null, val confirmation: Boolean = false,
) { override fun toString() = "AssistantState(REDACTED)" }

/** Destination-owned memory; operations hold only platform receipt metadata on disk. */
class AssistantViewModel(private val repository: AssistantRepository, private val contexts: AssistantContextReader,
    private val assurance: AssistantAssurancePort, private val handoff: ClinicalHandoffPort,
    private val session: SessionPort, private val operations: OperationPort, private val clock: AppClock) : ViewModel() {
    private val mutable = MutableStateFlow(AssistantState())
    val state = mutable.asStateFlow()
    private val epoch=session.state.value.let { it.authEpoch to it.contextEpoch }
    private var valid=true
    private var job: Job?=null
    private var sequence=0L
    private var retryAction: (() -> Unit)?=null
    private var grant: AssuranceGrant?=null
    private var handoffIntent: ClinicalHandoffRequest?=null
    init { viewModelScope.launch { session.state.collect { s ->
        if(s.phase != SessionPhase.READY || epoch != (s.authEpoch to s.contextEpoch)) {
            valid=false; sequence++; job?.cancel(); grant=null; handoffIntent=null; retryAction=null; mutable.value=AssistantState("CLEARED")
        }
    } } }
    private fun permit(vararg grants: String) = valid && session.state.value.phase == SessionPhase.READY &&
        grants.all { session.state.value.workspace?.allows(it) == true }
    private fun failure(result: ApiResult<Nothing>) {
        grant=null
        val phase=when(result) {
            ApiResult.StaleScope -> "STALE"
            ApiResult.OutcomeUnknown -> "UNKNOWN"
            is ApiResult.Failure -> when {
                result.status in setOf(401,403) -> "DENIED"
                result.status == 410 -> "EXPIRED"
                result.status == 404 -> "NOT_FOUND"
                result.status == 412 || result.code in setOf("CONTEXT_STALE","VERSION_CONFLICT") -> "STALE"
                else -> "ERROR"
            }
            else -> "ERROR"
        }
        mutable.value=mutable.value.copy(phase=phase,busy=false,confirmation=false,
            draft=if(phase in setOf("DENIED","EXPIRED","STALE","NOT_FOUND")) null else mutable.value.draft,
            target=if(phase in setOf("DENIED","STALE")) null else mutable.value.target,notice=phase)
    }
    private fun <T> value(result: ApiResult<T>): T {
        val current=session.state.value
        if(!valid || current.phase!=SessionPhase.READY || epoch!=(current.authEpoch to current.contextEpoch)) throw ResultFailure(ApiResult.StaleScope)
        return when(result) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> throw ResultFailure(result)
            ApiResult.StaleScope -> throw ResultFailure(ApiResult.StaleScope)
            ApiResult.OutcomeUnknown -> throw ResultFailure(ApiResult.OutcomeUnknown)
        }
    }
    private fun launch(read: Boolean = true, block: suspend () -> Unit) {
        if(!valid || mutable.value.busy || mutable.value.pending != null && read) return
        val run=++sequence
        if(read) mutable.value=mutable.value.copy(phase="LOADING",busy=true,notice=null,confirmation=false)
        else mutable.value=mutable.value.copy(busy=true,notice=null,confirmation=false)
        job=viewModelScope.launch {
            val snapshot=session.snapshot() ?: return@launch failure(ApiResult.StaleScope)
            try { block() }
            catch(cancel: CancellationException) { throw cancel }
            catch(error: ResultFailure) { if(valid && session.matches(snapshot)) failure(error.result) }
            catch(_: Exception) { if(valid && session.matches(snapshot)) failure(ApiResult.Failure("INVALID_RESPONSE")) }
            finally { if(valid && run == sequence && session.matches(snapshot)) mutable.value=mutable.value.copy(busy=false) }
        }
    }
    fun home() { retryAction=::home; launch { val list=value(repository.conversations()); mutable.value=AssistantState(if(list.items.isEmpty()) "EMPTY" else "READY",conversations=list.items) } }
    fun openConversation(id: String) { retryAction={openConversation(id)}; launch {
        require(Ids.valid(id)); val conversation=value(repository.conversation(id)); require(conversation.id==id)
        val target=value(contexts.validate(conversation.context)); val messages=value(repository.messages(id))
        require(messages.items.all { it.conversationId==id })
        mutable.value=AssistantState("READY",conversation=conversation,context=conversation.context,target=target,messages=messages.items,
            drafts=if(target != null && permit("draft.read")) value(repository.drafts(target.id)).items else emptyList())
    } }
    fun context(context: AssistantContext) { retryAction={context(context)}; launch {
        val target=value(contexts.validate(context)); mutable.value=AssistantState("READY",context=context,target=target)
    } }
    fun search() { val query=mutable.value.input; launch { val rows=value(contexts.search(query)); mutable.value=mutable.value.copy(phase=if(rows.items.isEmpty()) "EMPTY" else "READY",patients=rows.items) } }
    fun patient(patient: Patient) { launch {
        val context=AssistantContext("PATIENT",patient.id); value(contexts.validate(context))
        val rows=if(permit("encounter.read")) value(contexts.encounters(patient.reference())).items else emptyList()
        mutable.value=AssistantState("READY",context=context,encounters=rows)
    } }
    fun input(text: String) { if(valid && !mutable.value.busy && mutable.value.pending==null) { grant=null; mutable.value=mutable.value.copy(input=text,confirmation=false) } }
    fun edit(content: ClinicalContent) { if(valid && !mutable.value.busy && mutable.value.pending==null) { grant=null; mutable.value=mutable.value.copy(edit=content,confirmation=false) } }
    fun retry() { if(mutable.value.pending==null) retryAction?.invoke() }
    fun invalidRoute() { mutable.value=AssistantState("ERROR"); retryAction=null }
    private suspend fun freshTarget(): ClinicalRecord {
        val target=requireNotNull(mutable.value.target)
        val fresh=value(contexts.validate(AssistantContext("ENCOUNTER",target.patientId,target.encounterId))) ?: throw ResultFailure(ApiResult.StaleScope)
        if(fresh.id != target.id || fresh.versionToken != target.versionToken || fresh.status != "DRAFT") throw ResultFailure(ApiResult.Failure("VERSION_CONFLICT",412))
        return fresh
    }
    private fun command(permission: String, call: suspend (OperationReceipt)->ApiResult<AssistantReceipt>) {
        if(!permit(permission) || mutable.value.pending!=null || mutable.value.busy || mutable.value.receipt!=null || mutable.value.evidence!=null) return
        grant=null
        launch(false) {
            if(operations.outstanding().isNotEmpty()) { mutable.value=mutable.value.copy(phase="RECOVERY_REQUIRED"); return@launch }
            val operation=operations.prepare(); mutable.value=mutable.value.copy(pending=operation,phase="GENERATING")
            val result=try { withTimeout(75_000) { call(operation) } } catch(_: TimeoutCancellationException) { ApiResult.OutcomeUnknown }
            when(result) {
                is ApiResult.Success -> accept(result.value,operation)
                else -> { mutable.value=mutable.value.copy(phase="UNKNOWN",notice="UNKNOWN"); reconcile(operation) }
            }
        }
    }
    private suspend fun accept(receipt: AssistantReceipt, operation: OperationReceipt) {
        require(receipt.operationId==operation.operationId)
        when(receipt.type) {
            "CONVERSATION" -> { val item=value(repository.conversation(receipt.resourceId)); require(item.ownerUserId==operation.ownerUserId && item.workspaceId==operation.workspaceId); mutable.value=mutable.value.copy(conversation=item) }
            "MESSAGE" -> {
                val conversation=value(repository.conversation(requireNotNull(receipt.parentId)))
                require(conversation.id==receipt.parentId && conversation.workspaceId==operation.workspaceId && conversation.ownerUserId==operation.ownerUserId)
                val rows=value(repository.messages(conversation.id)); require(rows.items.any { it.id==receipt.resourceId && it.role=="ASSISTANT" && it.requestOperationId==operation.operationId })
                mutable.value=mutable.value.copy(conversation=conversation,messages=rows.items,input="")
            }
            "AI_DRAFT" -> { val draft=value(repository.draft(receipt.resourceId)); require(draft.workspaceId==operation.workspaceId); mutable.value=mutable.value.copy(draft=draft,edit=null) }
        }
        mutable.value=mutable.value.copy(phase="SAVED",receipt=receipt,notice="SAVED")
    }
    fun createConversation() { val context=mutable.value.context ?: return; command("assistant.use") { value(contexts.validate(context)); repository.create(context,it) } }
    fun send() { val s=mutable.value; val conversation=s.conversation ?: return
        if(s.input.isBlank()) return
        command("assistant.use") { value(contexts.validate(conversation.context)); if(s.target!=null) freshTarget(); repository.send(conversation.id,s.input,it) }
    }
    fun generate() { if(mutable.value.target?.status!="DRAFT") return; command("draft.generate") { val target=freshTarget(); repository.generate(target.reference(),null,it) } }
    fun openDraft(id: String) { retryAction={openDraft(id)}; grant=null; launch {
        require(Ids.valid(id)); val draft=value(repository.draft(id)); require(draft.id==id)
        val target=value(contexts.record(draft.targetRecordId))
        if(!draft.matches(target) && draft.status !in setOf("APPROVED","REJECTED")) throw ResultFailure(ApiResult.Failure("VERSION_CONFLICT",412))
        mutable.value=AssistantState("READY",draft=draft,target=target,context=AssistantContext("ENCOUNTER",draft.patientId,draft.encounterId))
    } }
    fun review() { val d=mutable.value.draft ?: return; if(d.status!="GENERATED") return; command("draft.review") { freshTarget(); repository.review(d,it) } }
    fun saveEdit() { val s=mutable.value; val d=s.draft ?: return; val content=s.edit ?: return; if(d.status!="IN_REVIEW") return; command("draft.edit") { freshTarget(); repository.edit(d,content,it) } }
    fun reject() { val d=mutable.value.draft ?: return; if(d.status!="IN_REVIEW") return; command("draft.reject") { repository.reject(d,null,it) } }
    fun requestAssurance() {
        val d=mutable.value.draft ?: return
        if(d.status!="IN_REVIEW" || mutable.value.edit!=null || !permit("draft.approve","record.edit") || mutable.value.pending!=null) return
        launch {
            val target=freshTarget(); val current=value(repository.draft(d.id))
            if(current.versionToken!=d.versionToken || !current.matches(target)) throw ResultFailure(ApiResult.Failure("VERSION_CONFLICT",412))
            val snapshot=session.snapshot() ?: throw ResultFailure(ApiResult.StaleScope)
            val binding=AssuranceBinding("draft.approve",d.workspaceId,d.id,d.versionToken,target.versionToken)
            val obtained=value(assurance.request(binding,snapshot)); obtained.validate(clock.now()); require(obtained.binding==binding)
            val after=value(repository.draft(d.id)); val afterTarget=freshTarget()
            if(after.versionToken!=d.versionToken || !after.matches(afterTarget)) throw ResultFailure(ApiResult.Failure("VERSION_CONFLICT",412))
            grant=obtained; mutable.value=mutable.value.copy(phase="READY",confirmation=true)
        }
    }
    fun cancelConfirmation() { grant=null; mutable.value=mutable.value.copy(confirmation=false) }
    fun approve() {
        val s=mutable.value; val d=s.draft ?: return; val assurance=grant ?: return
        if(!s.confirmation || s.pending!=null || s.busy || !permit("draft.approve","record.edit")) return
        grant=null
        launch(false) {
            val target=freshTarget(); val current=value(repository.draft(d.id))
            if(current.status!="IN_REVIEW" || current.versionToken!=d.versionToken || !current.matches(target)) throw ResultFailure(ApiResult.Failure("VERSION_CONFLICT",412))
            assurance.validate(clock.now())
            if(operations.outstanding().isNotEmpty()) { mutable.value=mutable.value.copy(phase="RECOVERY_REQUIRED"); return@launch }
            val operation=operations.prepare(); val snapshot=session.snapshot() ?: throw ResultFailure(ApiResult.StaleScope)
            val request=ClinicalHandoffRequest(d.id,d.versionToken,target.reference(),assurance,operation,snapshot)
            handoffIntent=request; mutable.value=mutable.value.copy(pending=operation,phase="GENERATING")
            when(val result=handoff.request(request)) {
                is ApiResult.Success -> verifyHandoff(result.value,request)
                else -> { mutable.value=mutable.value.copy(phase="UNKNOWN"); reconcile(operation) }
            }
        }
    }
    private suspend fun verifyHandoff(e: HandoffEvidence, request: ClinicalHandoffRequest) {
        val d=mutable.value.draft ?: throw ResultFailure(ApiResult.OutcomeUnknown)
        val record=value(handoff.readCommitted(e)); val approved=value(repository.draft(d.id))
        if(e.operationId!=request.operation.operationId || e.recordId!=request.target.recordId ||
            e.recordVersion.toLong()!=request.target.currentVersion.toLong()+1 || record.id!=e.recordId ||
            record.current.id!=e.recordVersionId || record.currentVersion!=e.recordVersion || record.versionToken!=e.recordVersionToken ||
            record.workspaceId!=request.target.workspaceId || record.patientId!=d.patientId || record.encounterId!=d.encounterId ||
            record.status!="DRAFT" || record.reviewedVersion!=null || record.current.kind!="AI_HANDOFF" || record.current.sourceDraftId!=d.id ||
            record.current.createdBy!=request.session.userId || record.current.createdAt!=e.committedAt ||
            e.recordVersionToken==request.target.versionToken || e.approvedDraftVersionToken==request.reviewedVersionToken ||
            !sameContent(record.current.content,d.content) || approved.status!="APPROVED" || approved.versionToken!=e.approvedDraftVersionToken ||
            approved.approvedBy!=request.session.userId || approved.targetRecordId!=request.target.recordId ||
            approved.targetVersionToken!=request.target.versionToken || approved.handoff?.same(e)!=true)
            throw ResultFailure(ApiResult.OutcomeUnknown)
        mutable.value=mutable.value.copy(phase="HANDOFF",evidence=e,confirmation=false,notice="HANDOFF")
    }
    private suspend fun reconcile(operation: OperationReceipt) {
        val result=repository.outcome(operation)
        if(!valid || epoch!=session.state.value.let { it.authEpoch to it.contextEpoch }) return
        when(result) {
            is ApiResult.Success -> when(result.value.state) {
                "SUCCEEDED" -> {
                    result.value.receipt?.let { accept(it,operation) }
                    result.value.handoff?.let { evidence -> handoffIntent?.let { verifyHandoff(evidence,it) } ?: run { mutable.value=mutable.value.copy(phase="VERIFICATION_UNAVAILABLE") } }
                }
                "FAILED","CLOSED" -> { operations.acknowledgeResolved(operation.operationId); mutable.value=mutable.value.copy(phase="RESOLVED_FAILURE",pending=null,confirmation=false) }
                else -> mutable.value=mutable.value.copy(phase="UNKNOWN")
            }
            else -> mutable.value=mutable.value.copy(phase="UNKNOWN")
        }
    }
    fun checkOutcome() { val operation=mutable.value.pending ?: return; launch(false) { reconcile(operation) } }
    fun closeUnknown() { val operation=mutable.value.pending ?: return; launch(false) { value(repository.close(operation)); reconcile(operation) } }
    fun discoverOutstanding() { launch { val op=operations.outstanding().firstOrNull(); mutable.value=mutable.value.copy(phase=if(op==null) "READY" else "UNKNOWN",pending=op) } }
    fun stopWaiting() {
        if(mutable.value.pending==null || !mutable.value.busy) return
        sequence++; job?.cancel(); grant=null; mutable.value=mutable.value.copy(phase="UNKNOWN",busy=false,confirmation=false)
    }
    fun acknowledge(action: ()->Unit = {}) {
        val s=mutable.value; val operation=s.pending ?: return
        if(s.phase !in setOf("SAVED","HANDOFF") || s.busy) return
        launch(false) {
            operations.acknowledgeResolved(operation.operationId)
            mutable.value=mutable.value.copy(phase="READY",pending=null,receipt=null,notice=null)
            action()
        }
    }
    private class ResultFailure(val result: ApiResult<Nothing>): Exception()
}
