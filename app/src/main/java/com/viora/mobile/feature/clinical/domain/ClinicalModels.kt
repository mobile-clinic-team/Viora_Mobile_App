package com.viora.mobile.feature.clinical.domain

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import java.time.Instant

internal fun clinicalText(value: String, max: Int, multiline: Boolean = false) {
    require(value.codePointCount(0, value.length) <= max)
    require(value.none { it.isISOControl() && !(multiline && it in "\n\t") })
}
internal fun clinicalIds(vararg values: String?) { require(values.filterNotNull().all(Ids::valid)) }
internal fun clinicalActions(values: Set<String>) {
    require(values.size <= 128)
    values.forEach { require(it.isNotBlank()); clinicalText(it, 128) }
}
internal fun counter(value: String): Long {
    require(value.matches(Regex("[1-9][0-9]{0,18}")))
    return value.toLong().also { require(it > 0) }
}

/** Shared immutable content schema for future clinical/AI consumers. It conveys no write authority. */
class ClinicalContent(val diagnosis: String, val symptoms: String, val clinicalNotes: String, val treatmentPlan: String) {
    init { listOf(diagnosis, symptoms, clinicalNotes, treatmentPlan).forEach { clinicalText(it, 16000, true) } }
    override fun toString() = "ClinicalContent(REDACTED)"
}

class Encounter(val id: String, val workspaceId: String, val versionToken: String, val allowedActions: Set<String>,
    val createdAt: Instant, val updatedAt: Instant, val patientId: String, val doctorId: String?,
    val appointmentId: String?, val recordId: String?, val status: String, val startedAt: Instant?, val endedAt: Instant?) {
    init {
        clinicalIds(id, workspaceId, patientId, doctorId, appointmentId, recordId)
        require(VersionToken.valid(versionToken)); clinicalActions(allowedActions); clinicalText(status, 64)
        require(status.isNotBlank())
    }
    val supported get() = status in setOf("OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED")
    override fun toString() = "Encounter(REDACTED)"
}

class RecordVersion(val id: String, val recordId: String, val version: String, val content: ClinicalContent,
    val kind: String, val createdBy: String, val createdAt: Instant, val amendmentReason: String?, val sourceDraftId: String?) {
    init {
        clinicalIds(id, recordId, createdBy, sourceDraftId); counter(version); clinicalText(kind, 64); require(kind.isNotBlank())
        amendmentReason?.let { clinicalText(it, 2000, true) }
    }
    val supported get() = kind in setOf("INITIAL", "EDIT", "AMENDMENT", "AI_HANDOFF")
    override fun toString() = "RecordVersion(REDACTED)"
}

class ClinicalRecord(val id: String, val workspaceId: String, val versionToken: String, val allowedActions: Set<String>,
    val createdAt: Instant, val updatedAt: Instant, val encounterId: String, val patientId: String, val status: String,
    val currentVersion: String, val current: RecordVersion, val reviewedVersion: String?) {
    init {
        clinicalIds(id, workspaceId, encounterId, patientId); require(VersionToken.valid(versionToken)); clinicalActions(allowedActions)
        clinicalText(status, 64); require(status.isNotBlank())
        val currentNumber = counter(currentVersion)
        reviewedVersion?.let { require(counter(it) <= currentNumber) }
        require(current.recordId == id && current.version == currentVersion)
    }
    val supported get() = status in setOf("DRAFT", "IN_REVIEW", "FINALIZED", "AMENDED") && current.supported
    fun reference() = ClinicalRecordReference(id, workspaceId, patientId, encounterId, versionToken, currentVersion, current.id)
    override fun toString() = "ClinicalRecord(REDACTED)"
}

/** Memory-only read reference. Re-read under current permissions before any future mutation/handoff. Never serialize as a route. */
class ClinicalRecordReference(val recordId: String, val workspaceId: String, val patientId: String, val encounterId: String,
    val versionToken: String, val currentVersion: String, val recordVersionId: String) {
    init { clinicalIds(recordId, workspaceId, patientId, encounterId, recordVersionId); require(VersionToken.valid(versionToken)); counter(currentVersion) }
    override fun toString() = "ClinicalRecordReference(REDACTED)"
}
