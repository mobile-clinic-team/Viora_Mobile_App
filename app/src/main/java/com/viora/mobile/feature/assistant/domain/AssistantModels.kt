package com.viora.mobile.feature.assistant.domain

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.text
import java.time.Instant

class AssistantContext(val kind: String, val patientId: String? = null, val encounterId: String? = null) {
    init {
        require(listOfNotNull(patientId, encounterId).all(Ids::valid))
        require(when (kind) { "GENERAL" -> patientId == null && encounterId == null
            "PATIENT" -> patientId != null && encounterId == null
            "ENCOUNTER" -> patientId != null && encounterId != null; else -> false })
    }
    fun same(other: AssistantContext) = kind == other.kind && patientId == other.patientId && encounterId == other.encounterId
    override fun toString() = "AssistantContext(REDACTED)"
}
class Provenance(val id: String, val kind: String, val sourceId: String, val sourceVersion: String,
    val label: String, val excerpt: String?) {
    init {
        require(Ids.valid(id) && Ids.valid(sourceId) && kind in setOf("RECORD_VERSION", "APPROVED_KNOWLEDGE"))
        require(sourceVersion.isNotBlank() && label.isNotBlank()); text(sourceVersion,128); text(label,200)
        excerpt?.let { text(it,500,true) }
    }
    override fun toString() = "Provenance(REDACTED)"
}
class Conversation(val id: String, val workspaceId: String, val ownerUserId: String, val context: AssistantContext,
    val status: String, val createdAt: Instant, val updatedAt: Instant, val expiresAt: Instant, val allowedActions: Set<String>) {
    init { require(listOf(id, workspaceId, ownerUserId).all(Ids::valid)); require(status in setOf("ACTIVE","CLOSED","EXPIRED")); require(expiresAt > createdAt) }
    override fun toString() = "Conversation(REDACTED)"
}
class Message(val id: String, val conversationId: String, val role: String, val text: String,
    val createdAt: Instant, val requestOperationId: String, val provenance: List<Provenance>) {
    init {
        require(listOf(id,conversationId,requestOperationId).all(Ids::valid)); require(role in setOf("USER","ASSISTANT"))
        text(text, if(role == "USER") 4000 else 16000,true); require(text.isNotBlank() && provenance.size <= 8)
    }
    override fun toString() = "Message(REDACTED)"
}
class AiDraft(val id: String, val workspaceId: String, val versionToken: String, val allowedActions: Set<String>,
    val createdAt: Instant, val updatedAt: Instant, val patientId: String, val encounterId: String,
    val targetRecordId: String, val targetVersionToken: String, val draftType: String,
    val content: ClinicalContent, val provenance: List<Provenance>, val status: String, val createdBy: String,
    val reviewedBy: String?, val approvedBy: String?, val rejectedBy: String?, val decidedAt: Instant?,
    val expiresAt: Instant, val handoff: HandoffEvidence?) {
    init {
        require(listOfNotNull(id,workspaceId,patientId,encounterId,targetRecordId,createdBy,reviewedBy,approvedBy,rejectedBy).all(Ids::valid))
        require(VersionToken.valid(versionToken) && VersionToken.valid(targetVersionToken))
        require(draftType == "CLINICAL_NOTE" && provenance.size in 1..8 && provenance.map { it.id }.distinct().size == provenance.size)
        require(status in setOf("GENERATED","IN_REVIEW","APPROVED","REJECTED","EXPIRED")); require(expiresAt > createdAt)
        require(status != "IN_REVIEW" || reviewedBy != null)
        require(status != "APPROVED" || (approvedBy != null && decidedAt != null && handoff != null))
        require(status != "REJECTED" || (rejectedBy != null && decidedAt != null))
    }
    fun matches(record: ClinicalRecord) = workspaceId == record.workspaceId && patientId == record.patientId &&
        encounterId == record.encounterId && targetRecordId == record.id && targetVersionToken == record.versionToken && record.status == "DRAFT"
    override fun toString() = "AiDraft(REDACTED)"
}
/** Payload-free command result. Follow with an authorized read before presenting current content. */
class AssistantReceipt(val operationId: String, val resourceId: String, val type: String, val parentId: String? = null) {
    init { require(listOfNotNull(operationId,resourceId,parentId).all(Ids::valid)); require(type in setOf("CONVERSATION","MESSAGE","AI_DRAFT")) }
    override fun toString() = "AssistantReceipt(REDACTED)"
}
class AssistantOutcome(val state: String, val receipt: AssistantReceipt? = null, val handoff: HandoffEvidence? = null) {
    init {
        require(state in setOf("PROCESSING","INDETERMINATE","SUCCEEDED","FAILED","CLOSED"))
        require(if(state == "SUCCEEDED") (receipt != null) xor (handoff != null) else receipt == null && handoff == null)
    }
    override fun toString() = "AssistantOutcome(REDACTED)"
}
fun sameContent(a: ClinicalContent, b: ClinicalContent) = a.diagnosis == b.diagnosis && a.symptoms == b.symptoms &&
    a.clinicalNotes == b.clinicalNotes && a.treatmentPlan == b.treatmentPlan
