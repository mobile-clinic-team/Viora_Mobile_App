package com.viora.mobile.feature.assistant.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.*

/** Fake-backed AI01–13 boundary. Live adapters remain unavailable behind BD-01/05/06. */
interface AssistantRepository {
    suspend fun conversations(): ApiResult<DirectoryPage<Conversation>>
    suspend fun conversation(id: String): ApiResult<Conversation>
    suspend fun messages(id: String): ApiResult<DirectoryPage<Message>>
    suspend fun create(context: AssistantContext, operation: OperationReceipt): ApiResult<AssistantReceipt>
    suspend fun send(id: String, question: String, operation: OperationReceipt): ApiResult<AssistantReceipt>
    suspend fun generate(target: ClinicalRecordReference, instruction: String?, operation: OperationReceipt): ApiResult<AssistantReceipt>
    suspend fun draft(id: String): ApiResult<AiDraft>
    suspend fun drafts(targetRecordId: String): ApiResult<DirectoryPage<AiDraft>>
    suspend fun review(draft: AiDraft, operation: OperationReceipt): ApiResult<AssistantReceipt>
    suspend fun edit(draft: AiDraft, content: ClinicalContent, operation: OperationReceipt): ApiResult<AssistantReceipt>
    suspend fun reject(draft: AiDraft, reason: String?, operation: OperationReceipt): ApiResult<AssistantReceipt>
    suspend fun outcome(operation: OperationReceipt): ApiResult<AssistantOutcome>
    suspend fun close(operation: OperationReceipt): ApiResult<AssistantOutcome>
}

/** Feature-facing assurance seam using A's existing binding and grant types; no browser/provider implementation. */
fun interface AssistantAssurancePort {
    suspend fun request(binding: AssuranceBinding, snapshot: SessionSnapshot): ApiResult<AssuranceGrant>
}

class AssistantContextReader(private val patients: PatientDirectory, private val clinical: ClinicalReadRepository,
    private val session: SessionPort) {
    suspend fun search(query: String) = patients.search(PatientSearch(query))
    suspend fun encounters(patient: PatientReference) = clinical.encounters(patient)
    suspend fun validate(context: AssistantContext): ApiResult<ClinicalRecord?> {
        val snapshot = session.snapshot() ?: return ApiResult.StaleScope
        val workspace = snapshot.workspace ?: return ApiResult.StaleScope
        if(!workspace.allows("assistant.use")) return ApiResult.Failure("FORBIDDEN",403)
        if(context.kind == "GENERAL") return ApiResult.Success(null)
        if(!workspace.allows("patient.read")) return ApiResult.Failure("FORBIDDEN",403)
        val patient = when(val result = patients.patient(context.patientId!!)) {
            is ApiResult.Success -> result.value
            else -> return result as ApiResult<Nothing>
        }
        if(patient.id != context.patientId || patient.workspaceId != workspace.id) return ApiResult.StaleScope
        if(context.kind == "PATIENT") return if(session.matches(snapshot)) ApiResult.Success(null) else ApiResult.StaleScope
        if(!workspace.allows("encounter.read") || !workspace.allows("record.read")) return ApiResult.Failure("FORBIDDEN",403)
        val encounter = when(val result = clinical.encounter(context.encounterId!!)) {
            is ApiResult.Success -> result.value
            else -> return result as ApiResult<Nothing>
        }
        if(encounter.id != context.encounterId || encounter.patientId != context.patientId || encounter.workspaceId != workspace.id) return ApiResult.StaleScope
        val record = encounter.recordId?.let { id -> when(val result = clinical.record(id)) {
            is ApiResult.Success -> result.value
            else -> return result as ApiResult<Nothing>
        } }
        if(record != null && (record.id != encounter.recordId || record.encounterId != encounter.id ||
            record.patientId != patient.id || record.workspaceId != workspace.id)) return ApiResult.StaleScope
        return if(session.matches(snapshot)) ApiResult.Success(record) else ApiResult.StaleScope
    }
    suspend fun record(id: String) = clinical.record(id)
}
