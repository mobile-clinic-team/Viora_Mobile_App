package com.viora.mobile.feature.clinical.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.AssuranceGrant
import com.viora.mobile.core.session.SessionSnapshot
import java.time.Instant

/** AI08 feature-facing boundary. No clinical mutation implementation is supplied here. */
class ClinicalHandoffRequest(val draftId: String, val reviewedVersionToken: String,
    val target: ClinicalRecordReference, val assurance: AssuranceGrant,
    val operation: OperationReceipt, val session: SessionSnapshot) {
    init {
        require(Ids.valid(draftId) && VersionToken.valid(reviewedVersionToken))
        operation.validate()
        require(operation.ownerUserId == session.userId && operation.workspaceId == target.workspaceId &&
            session.workspace?.id == target.workspaceId)
    }
    override fun toString() = "ClinicalHandoffRequest(REDACTED)"
}

class HandoffEvidence(val operationId: String, val recordId: String, val recordVersionId: String,
    val recordVersion: String, val recordVersionToken: String, val approvedDraftVersionToken: String,
    val auditEventId: String, val committedAt: Instant) {
    init {
        require(listOf(operationId, recordId, recordVersionId, auditEventId).all(Ids::valid))
        require(VersionToken.valid(recordVersionToken) && VersionToken.valid(approvedDraftVersionToken))
        require(recordVersion.matches(Regex("[1-9][0-9]{0,18}")) && recordVersion.toLong() > 0)
    }
    fun same(other: HandoffEvidence) = operationId == other.operationId && recordId == other.recordId &&
        recordVersionId == other.recordVersionId && recordVersion == other.recordVersion && recordVersionToken == other.recordVersionToken &&
        approvedDraftVersionToken == other.approvedDraftVersionToken && auditEventId == other.auditEventId && committedAt == other.committedAt
    override fun toString() = "HandoffEvidence(REDACTED)"
}

/** The owner supplies an authorized post-commit read, never merely an acceptance acknowledgement. */
interface ClinicalHandoffPort {
    suspend fun request(request: ClinicalHandoffRequest): ApiResult<HandoffEvidence>
    suspend fun readCommitted(evidence: HandoffEvidence): ApiResult<ClinicalRecord>
}

fun interface ClinicalRecordNavigation { fun open(reference: ClinicalRecordReference) }
