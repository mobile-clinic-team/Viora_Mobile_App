package com.viora.mobile.feature.clinical.data.handoff

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.clinical.domain.*
import kotlinx.serialization.json.*
import java.net.URLEncoder

/** AI08 is one server transaction. This adapter never writes a clinical repository or compensates a failed handoff. */
class HttpClinicalHandoff(private val requests: AuthenticatedRequestPort, private val session: SessionPort,
    private val assurance: StepUpController?, private val reads: ClinicalReadRepository, private val clock: AppClock) : ClinicalHandoffPort {
    override suspend fun request(request: ClinicalHandoffRequest): ApiResult<HandoffEvidence> {
        val current = session.snapshot() ?: return ApiResult.StaleScope
        if (!sameAssuranceSession(request.session, current)) return ApiResult.StaleScope
        if (current.workspace?.allows("draft.approve") != true || current.workspace.allows("record.edit") != true)
            return ApiResult.Failure("FORBIDDEN", 403)
        val created = WireTime.parse(request.operation.createdAt)
        if (created < clock.now().minusSeconds(86400) || created > clock.now().plusSeconds(60))
            return ApiResult.Failure("OPERATION_EXPIRED", 410)
        val binding = AssuranceBinding("draft.approve", request.target.workspaceId, request.draftId,
            request.reviewedVersionToken, request.target.versionToken)
        if (assurance?.consume(request.assurance, binding, request.target.recordId, current) != true)
            return ApiResult.Failure("ASSURANCE_REQUIRED", 403)
        val body = buildJsonObject {
            put("targetRecordId", request.target.recordId); put("targetVersionToken", request.target.versionToken)
        }.toString()
        val result = requests.execute(ApiRequest("POST", "/v1/ai/drafts/${request.draftId}/approve", RequestScope.WORKSPACE,
            body, request.reviewedVersionToken, request.operation.operationId, request.operation.createdAt,
            workspaceId = request.target.workspaceId, assuranceToken = request.assurance.assuranceToken, expectedSession = current))
        if (!session.matches(current)) return ApiResult.StaleScope
        return when (result) {
            is ApiResult.Success -> try {
                val receipt = HandoffWire.receipt(result.value, request.operation)
                val e = receipt.evidence
                require(receipt.draftId == request.draftId && e.recordId == request.target.recordId)
                require(e.recordVersion.toLong() == Math.addExact(request.target.currentVersion.toLong(), 1))
                require(e.recordVersionId != request.target.recordVersionId && e.recordVersionToken != request.target.versionToken &&
                    e.approvedDraftVersionToken == request.reviewedVersionToken)
                ApiResult.Success(e)
            } catch (_: Exception) { ApiResult.OutcomeUnknown }
            is ApiResult.Failure -> result
            ApiResult.OutcomeUnknown -> ApiResult.OutcomeUnknown
            ApiResult.StaleScope -> ApiResult.StaleScope
        }
    }
    override suspend fun readCommitted(evidence: HandoffEvidence): ApiResult<ClinicalRecord> {
        val result = reads.record(evidence.recordId)
        if (result is ApiResult.Success) {
            val r = result.value
            if (r.id != evidence.recordId || r.versionToken != evidence.recordVersionToken || r.currentVersion != evidence.recordVersion ||
                r.current.id != evidence.recordVersionId || r.status != "DRAFT" || r.reviewedVersion != null ||
                r.current.kind != "AI_HANDOFF" || r.current.createdAt != evidence.committedAt)
                return ApiResult.Failure("HANDOFF_VERIFICATION_UNAVAILABLE")
        }
        return result
    }
}

/** OP01/02/03 only: never retains or reconstructs a command body and never resends AI08. */
class HttpHandoffRecovery(private val requests: AuthenticatedRequestPort, private val session: SessionPort) {
    suspend fun discover(cursor: String? = null): ApiResult<HandoffOperationPage> {
        require(cursor == null || cursor.isNotBlank() && cursor.length <= 2048 && cursor.none(Char::isISOControl))
        val current = session.snapshot() ?: return ApiResult.StaleScope
        val suffix = cursor?.let { "&cursor=" + URLEncoder.encode(it, "UTF-8") }.orEmpty()
        val result = requests.execute(ApiRequest("GET", "/v1/operations?limit=100$suffix", RequestScope.WORKSPACE, expectedSession = current))
        if (!session.matches(current)) return ApiResult.StaleScope
        return parse(result, false, HandoffWire::page)
    }
    suspend fun lookup(operation: OperationReceipt) = resolve(operation, false)
    suspend fun close(operation: OperationReceipt) = resolve(operation, true)
    private suspend fun resolve(operation: OperationReceipt, close: Boolean): ApiResult<HandoffOperationStatus> {
        operation.validate()
        val current = session.snapshot() ?: return ApiResult.StaleScope
        if (current.userId != operation.ownerUserId || current.workspace?.id != operation.workspaceId) return ApiResult.StaleScope
        val result = requests.execute(ApiRequest(if (close) "POST" else "GET",
            "/v1/operations/${operation.operationId}" + if (close) "/close" else "", RequestScope.WORKSPACE,
            body = if (close) "{}" else null, operationCreatedAt = if (close) operation.createdAt else null,
            expectedSession = current))
        if (!session.matches(current)) return ApiResult.StaleScope
        return parse(result, close) { HandoffWire.status(it, operation) }
    }
    private fun <T> parse(result: ApiResult<ApiPayload>, mutation: Boolean, decode: (ApiPayload) -> T): ApiResult<T> = when (result) {
        is ApiResult.Success -> try { ApiResult.Success(decode(result.value)) } catch (_: Exception) {
            if (mutation) ApiResult.OutcomeUnknown else ApiResult.Failure("INVALID_RESPONSE")
        }
        is ApiResult.Failure -> result
        ApiResult.OutcomeUnknown -> ApiResult.OutcomeUnknown
        ApiResult.StaleScope -> ApiResult.StaleScope
    }
}

