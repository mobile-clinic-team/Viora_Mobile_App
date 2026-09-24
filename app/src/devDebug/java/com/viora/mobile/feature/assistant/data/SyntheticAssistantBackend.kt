package com.viora.mobile.feature.assistant.data

import com.viora.mobile.core.model.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.*
import java.time.Instant

enum class SyntheticGeneration { SUCCESS, TIMEOUT, FAILURE, UNKNOWN, LOST_RESPONSE, REJECTED }

/** In-memory test service, never a provider or clinical repository. All handoff evidence is explicitly simulated. */
class SyntheticAssistantBackend(private val session: SessionPort, private val clock: AppClock,
    private val contexts: AssistantContextReader, scope: CoroutineScope) : AssistantRepository, AssistantAssurancePort, ClinicalHandoffPort {
    private val conversations = linkedMapOf<String,Conversation>()
    private val messages = linkedMapOf<String,MutableList<Message>>()
    private val drafts = linkedMapOf<String,AiDraft>()
    private val outcomes = mutableMapOf<String,AssistantOutcome>()
    private val operations = mutableMapOf<String,OperationReceipt>()
    private val projections = mutableMapOf<String,ClinicalRecord>()
    private val assurances = mutableMapOf<String,Pair<SessionSnapshot,AssuranceGrant>>()
    private var sequence = 100L
    var generation = SyntheticGeneration.SUCCESS
    var beforeGeneration: (suspend () -> Unit)? = null
    var beforeRead: (suspend () -> Unit)? = null
    var nextReadFailure: ApiResult.Failure? = null
    var nextHandoffFailure: ApiResult<Nothing>? = null
    var handoffCalls = 0; private set
    var generationCalls = 0; private set
    init {
        scope.launch {
            var epochs = session.state.value.let { it.authEpoch to it.contextEpoch }
            session.state.collect { state ->
                val next = state.authEpoch to state.contextEpoch
                if(next != epochs) { conversations.clear(); messages.clear(); drafts.clear(); projections.clear(); assurances.clear(); epochs = next }
            }
        }
    }
    private fun id() = "90000000-0000-4000-8000-" + (++sequence).toString().padStart(12,'0')
    private fun token() = "\"assistant-demo-${++sequence}\""
    private fun fail(code: String, status: Int = 409): Nothing = throw SafeFailure(ApiResult.Failure(code,status))
    private fun operationOwner(operation: OperationReceipt, snapshot: SessionSnapshot) {
        operation.validate()
        if(operation.ownerUserId!=snapshot.userId || operation.workspaceId!=snapshot.workspace?.id) fail("RESOURCE_NOT_FOUND",404)
        operations[operation.operationId]?.let { known ->
            if(known.ownerUserId!=snapshot.userId || known.workspaceId!=snapshot.workspace?.id) fail("RESOURCE_NOT_FOUND",404)
            if(known.createdAt!=operation.createdAt) fail("IDEMPOTENCY_CONFLICT")
        }
    }
    private fun admission(operation: OperationReceipt) {
        val created=Instant.parse(operation.createdAt)
        if(created < clock.now().minusSeconds(86400) || created > clock.now().plusSeconds(60)) fail("OPERATION_EXPIRED",410)
    }
    private suspend fun <T> scoped(vararg grants: String, read: Boolean = false, block: suspend (SessionSnapshot) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.StaleScope
        if(!grants.all { snapshot.workspace?.allows(it) == true }) return ApiResult.Failure("FORBIDDEN",403)
        return try {
            if(read) { beforeRead?.invoke(); nextReadFailure?.let { nextReadFailure=null; throw SafeFailure(it) } }
            if(!session.matches(snapshot)) return ApiResult.StaleScope
            val result = block(snapshot)
            if(session.matches(snapshot)) ApiResult.Success(result) else ApiResult.StaleScope
        } catch(cancel: CancellationException) { throw cancel }
        catch(failure: SafeFailure) { failure.result }
        catch(_: IllegalArgumentException) { ApiResult.Failure("INVALID_RESPONSE") }
    }
    private fun <T> value(result: ApiResult<T>): T = when(result) {
        is ApiResult.Success -> result.value
        else -> throw SafeFailure(result as ApiResult<Nothing>)
    }
    private fun own(id: String, snapshot: SessionSnapshot): Conversation {
        val value = conversations[id] ?: fail("RESOURCE_NOT_FOUND",404)
        if(value.ownerUserId != snapshot.userId || value.workspaceId != snapshot.workspace?.id) fail("RESOURCE_NOT_FOUND",404)
        if(value.status != "ACTIVE" || clock.now() >= value.expiresAt) fail("RESOURCE_EXPIRED",410)
        return value
    }
    private fun ownDraft(id: String, snapshot: SessionSnapshot): AiDraft {
        val value = drafts[id] ?: fail("RESOURCE_NOT_FOUND",404)
        if(value.workspaceId != snapshot.workspace?.id || value.createdBy != snapshot.userId) fail("RESOURCE_NOT_FOUND",404)
        if(clock.now() >= value.expiresAt || value.status == "EXPIRED") fail("RESOURCE_EXPIRED",410)
        return value
    }
    override suspend fun conversations() = scoped("assistant.use",read=true) { s ->
        DirectoryPage(conversations.values.filter { it.workspaceId == s.workspace?.id && it.ownerUserId == s.userId && clock.now() < it.expiresAt }.sortedByDescending { it.updatedAt },null)
    }
    override suspend fun conversation(id: String) = scoped("assistant.use",read=true) { s -> own(id,s).also { value(contexts.validate(it.context)) } }
    override suspend fun messages(id: String) = scoped("assistant.use",read=true) { s ->
        value(contexts.validate(own(id,s).context)); DirectoryPage(messages[id]?.toList() ?: emptyList(),null)
    }
    private suspend fun command(operation: OperationReceipt, grant: String, block: suspend (SessionSnapshot) -> AssistantReceipt): ApiResult<AssistantReceipt> = scoped(grant) { snapshot ->
        operationOwner(operation,snapshot); admission(operation)
        if(operation.operationId in operations) fail("OPERATION_IN_PROGRESS") // Recovery only; never replay a command.
        operations[operation.operationId] = operation; outcomes[operation.operationId] = AssistantOutcome("PROCESSING")
        try {
            val receipt = block(snapshot)
            if(!session.matches(snapshot)) throw SafeFailure(ApiResult.StaleScope)
            outcomes[operation.operationId] = AssistantOutcome("SUCCEEDED",receipt)
            receipt
        } catch(cancel: CancellationException) { throw cancel }
        catch(failure: SafeFailure) {
            if(failure.result != ApiResult.OutcomeUnknown) outcomes[operation.operationId] = AssistantOutcome("FAILED")
            throw failure
        }
    }
    override suspend fun create(context: AssistantContext, operation: OperationReceipt) = command(operation,"assistant.use") { s ->
        value(contexts.validate(context)); val now=clock.now(); val id=id()
        conversations[id] = Conversation(id,s.workspace!!.id,s.userId,context,"ACTIVE",now,now,now.plusSeconds(3600),setOf("assistant.use"))
        AssistantReceipt(operation.operationId,id,"CONVERSATION")
    }
    private suspend fun generateResult() {
        generationCalls++; beforeGeneration?.invoke()
        when(generation) {
            SyntheticGeneration.TIMEOUT -> fail("AI_TIMEOUT",504)
            SyntheticGeneration.FAILURE -> fail("SERVICE_UNAVAILABLE",503)
            SyntheticGeneration.REJECTED -> fail("AI_OUTPUT_REJECTED",502)
            SyntheticGeneration.UNKNOWN -> throw SafeFailure(ApiResult.OutcomeUnknown)
            else -> Unit
        }
    }
    override suspend fun send(id: String, question: String, operation: OperationReceipt): ApiResult<AssistantReceipt> {
        text(question,4000,true); require(question.isNotBlank())
        val result = command(operation,"assistant.use") { s ->
            val conversation = own(id,s); value(contexts.validate(conversation.context)); generateResult()
            if(!session.matches(s)) throw SafeFailure(ApiResult.StaleScope)
            val now=clock.now(); val answer=id()
            val rows=messages.getOrPut(id) { mutableListOf() }
            if(rows.size >= 98) fail("FEATURE_UNAVAILABLE",503)
            rows += Message(id(),id,"USER",question,now,operation.operationId,emptyList())
            rows += Message(answer,id,"ASSISTANT","Synthetic advisory response. Review the authorized context; this is not a clinical decision.",now,operation.operationId,emptyList())
            AssistantReceipt(operation.operationId,answer,"MESSAGE",id)
        }
        return if(result is ApiResult.Success && generation == SyntheticGeneration.LOST_RESPONSE) ApiResult.OutcomeUnknown else result
    }
    override suspend fun generate(target: ClinicalRecordReference, instruction: String?, operation: OperationReceipt): ApiResult<AssistantReceipt> {
        instruction?.let { text(it,2000,true) }
        val result = command(operation,"draft.generate") { s ->
            if(!s.workspace!!.allows("record.read")) fail("FORBIDDEN",403)
            val record=value(contexts.validate(AssistantContext("ENCOUNTER",target.patientId,target.encounterId))) ?: fail("RESOURCE_NOT_FOUND",404)
            if(record.id != target.recordId || record.workspaceId != target.workspaceId || record.versionToken != target.versionToken) fail("VERSION_CONFLICT",412)
            if(record.status != "DRAFT") fail("INVALID_STATE")
            generateResult(); if(!session.matches(s)) throw SafeFailure(ApiResult.StaleScope)
            val now=clock.now(); val draftId=id()
            drafts[draftId] = AiDraft(draftId,s.workspace.id,token(),setOf("draft.read","draft.review","draft.edit","draft.approve","draft.reject"),now,now,
                target.patientId,target.encounterId,target.recordId,target.versionToken,"CLINICAL_NOTE",
                ClinicalContent("Synthetic draft — no diagnosis","Synthetic example only","Generated demo note for mandatory human review.","No clinical advice; demonstration only."),
                listOf(Provenance(id(),"RECORD_VERSION",record.current.id,record.currentVersion,"Synthetic source record",null)),"GENERATED",s.userId,null,null,null,null,now.plusSeconds(3600),null)
            AssistantReceipt(operation.operationId,draftId,"AI_DRAFT")
        }
        return if(result is ApiResult.Success && generation == SyntheticGeneration.LOST_RESPONSE) ApiResult.OutcomeUnknown else result
    }
    override suspend fun draft(id: String) = scoped("draft.read",read=true) { ownDraft(id,it) }
    override suspend fun drafts(targetRecordId: String) = scoped("draft.read","record.read",read=true) { s ->
        val record=value(contexts.record(targetRecordId)); if(record.workspaceId != s.workspace!!.id) fail("RESOURCE_NOT_FOUND",404)
        DirectoryPage(drafts.values.filter { it.targetRecordId == targetRecordId && it.workspaceId == s.workspace.id && it.createdBy == s.userId && clock.now() < it.expiresAt },null)
    }
    private fun updated(d: AiDraft, status: String=d.status, content: ClinicalContent=d.content, review: String?=d.reviewedBy,
        approve: String?=d.approvedBy, reject: String?=d.rejectedBy, evidence: HandoffEvidence?=d.handoff, version: String=token()) =
        AiDraft(d.id,d.workspaceId,version,d.allowedActions,d.createdAt,clock.now(),d.patientId,d.encounterId,d.targetRecordId,d.targetVersionToken,
            d.draftType,content,d.provenance,status,d.createdBy,review,approve,reject,if(status in setOf("APPROVED","REJECTED")) clock.now() else null,d.expiresAt,evidence)
    private suspend fun change(draft: AiDraft, op: OperationReceipt, grant: String, action: (AiDraft,SessionSnapshot)->AiDraft) = command(op,grant) { s ->
        val current=ownDraft(draft.id,s)
        if(grant !in current.allowedActions) fail("FORBIDDEN",403)
        if(current.versionToken != draft.versionToken) fail("VERSION_CONFLICT",412)
        drafts[draft.id]=action(current,s); AssistantReceipt(op.operationId,draft.id,"AI_DRAFT")
    }
    override suspend fun review(draft: AiDraft, operation: OperationReceipt) = change(draft,operation,"draft.review") { d,s ->
        if(d.status != "GENERATED") fail("INVALID_STATE"); updated(d,"IN_REVIEW",review=s.userId)
    }
    override suspend fun edit(draft: AiDraft, content: ClinicalContent, operation: OperationReceipt) = change(draft,operation,"draft.edit") { d,_ ->
        if(d.status != "IN_REVIEW") fail("INVALID_STATE"); updated(d,content=content)
    }
    override suspend fun reject(draft: AiDraft, reason: String?, operation: OperationReceipt): ApiResult<AssistantReceipt> {
        reason?.let { text(it,2000,true) }
        return change(draft,operation,"draft.reject") { d,s -> if(d.status != "IN_REVIEW") fail("INVALID_STATE"); updated(d,"REJECTED",reject=s.userId) }
    }
    override suspend fun request(binding: AssuranceBinding, snapshot: SessionSnapshot) = scoped("draft.approve","record.edit") { s ->
        if(!session.matches(snapshot)) throw SafeFailure(ApiResult.StaleScope)
        binding.validate(); val draft=ownDraft(binding.resourceId,s)
        if(draft.status != "IN_REVIEW" || binding.versionToken != draft.versionToken || binding.targetVersionToken != draft.targetVersionToken || binding.workspaceId != s.workspace!!.id) fail("ASSURANCE_REQUIRED",403)
        AssuranceGrant("synthetic-assurance-${id()}",clock.now().plusSeconds(120),binding).also { assurances[it.assuranceToken] = s to it }
    }
    override suspend fun request(request: ClinicalHandoffRequest): ApiResult<HandoffEvidence> = scoped("draft.approve","record.edit") { s ->
        handoffCalls++
        operationOwner(request.operation,s); admission(request.operation)
        if(!session.matches(request.session) || request.operation.ownerUserId != s.userId || request.operation.workspaceId != s.workspace!!.id) throw SafeFailure(ApiResult.StaleScope)
        if(request.operation.operationId in operations) fail("OPERATION_IN_PROGRESS")
        operations[request.operation.operationId]=request.operation; outcomes[request.operation.operationId]=AssistantOutcome("PROCESSING")
        try {
            nextHandoffFailure?.let { nextHandoffFailure=null; throw SafeFailure(it) }
            val d=ownDraft(request.draftId,s); val record=value(contexts.record(request.target.recordId))
            if(d.status != "IN_REVIEW") fail("INVALID_STATE")
            if(d.versionToken != request.reviewedVersionToken || !d.matches(record) || request.target.versionToken != record.versionToken) fail("VERSION_CONFLICT",412)
            val grant=assurances[request.assurance.assuranceToken] ?: fail("ASSURANCE_REQUIRED",403)
            if(!session.matches(grant.first) || grant.second.expiresAt <= clock.now() || grant.second.binding != AssuranceBinding("draft.approve",s.workspace.id,d.id,d.versionToken,record.versionToken)) fail("ASSURANCE_REQUIRED",403)
            val evidence=HandoffEvidence(request.operation.operationId,record.id,id(),(record.currentVersion.toLong()+1).toString(),token(),d.versionToken,id(),clock.now())
            // A returned demonstration projection only: C's repository/storage is never written.
            projections[evidence.operationId]=ClinicalRecord(record.id,record.workspaceId,evidence.recordVersionToken,record.allowedActions,record.createdAt,evidence.committedAt,record.encounterId,record.patientId,"DRAFT",evidence.recordVersion,
                RecordVersion(evidence.recordVersionId,record.id,evidence.recordVersion,d.content,"AI_HANDOFF",s.userId,evidence.committedAt,null,d.id),null)
            drafts[d.id]=updated(d,"APPROVED",approve=s.userId,evidence=evidence,version=token())
            assurances.remove(request.assurance.assuranceToken)
            outcomes[evidence.operationId]=AssistantOutcome("SUCCEEDED",handoff=evidence)
            evidence
        } catch(failure: SafeFailure) { if(failure.result != ApiResult.OutcomeUnknown) outcomes[request.operation.operationId]=AssistantOutcome("FAILED"); throw failure }
    }
    override suspend fun readCommitted(evidence: HandoffEvidence) = scoped("record.read",read=true) { s ->
        projections[evidence.operationId]?.takeIf { it.workspaceId == s.workspace!!.id } ?: fail("RESOURCE_NOT_FOUND",404)
    }
    override suspend fun outcome(operation: OperationReceipt) = scoped("assistant.use") { s ->
        operationOwner(operation,s)
        outcomes[operation.operationId] ?: fail("OPERATION_NOT_FOUND",404)
    }
    override suspend fun close(operation: OperationReceipt) = scoped("assistant.use") { s ->
        operationOwner(operation,s)
        outcomes[operation.operationId] ?: run { admission(operation); AssistantOutcome("CLOSED").also { operations[operation.operationId]=operation; outcomes[operation.operationId]=it } }
    }
    fun expireDraft(id: String) { drafts[id]?.let { drafts[id]=updated(it,"EXPIRED") } }
    private class SafeFailure(val result: ApiResult<Nothing>): Exception()
}

