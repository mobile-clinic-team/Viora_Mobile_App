package com.viora.mobile.feature.clinical.data.dto

import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.clinical.domain.*
import kotlinx.serialization.Serializable

@Serializable internal data class AccessDto(val allowedActions: List<String>) {
    fun values(): Set<String> { require(allowedActions.distinct().size == allowedActions.size); return allowedActions.toSet() }
}
@Serializable internal data class ContentDto(val diagnosis: String, val symptoms: String, val clinicalNotes: String, val treatmentPlan: String) {
    fun domain() = ClinicalContent(diagnosis, symptoms, clinicalNotes, treatmentPlan)
    override fun toString() = "ContentDto(REDACTED)"
}
@Serializable internal data class EncounterDto(val id: String, val workspaceId: String, val versionToken: String, val access: AccessDto,
    val createdAt: String, val updatedAt: String, val patientId: String, val doctorId: String?, val appointmentId: String?,
    val recordId: String?, val status: String, val startedAt: String?, val endedAt: String?) {
    fun domain(workspace: String): Encounter {
        require(workspaceId == workspace)
        return Encounter(id, workspaceId, versionToken, access.values(), WireTime.parse(createdAt), WireTime.parse(updatedAt),
            patientId, doctorId, appointmentId, recordId, status, startedAt?.let(WireTime::parse), endedAt?.let(WireTime::parse))
    }
    override fun toString() = "EncounterDto(REDACTED)"
}
@Serializable internal data class VersionDto(val id: String, val recordId: String, val version: String, val content: ContentDto,
    val kind: String, val createdBy: String, val createdAt: String, val amendmentReason: String?, val sourceDraftId: String?) {
    fun domain() = RecordVersion(id, recordId, version, content.domain(), kind, createdBy, WireTime.parse(createdAt), amendmentReason, sourceDraftId)
    override fun toString() = "VersionDto(REDACTED)"
}
@Serializable internal data class RecordDto(val id: String, val workspaceId: String, val versionToken: String, val access: AccessDto,
    val createdAt: String, val updatedAt: String, val encounterId: String, val patientId: String, val status: String,
    val currentVersion: String, val current: VersionDto, val reviewedVersion: String?) {
    fun domain(workspace: String): ClinicalRecord {
        require(workspaceId == workspace)
        return ClinicalRecord(id, workspaceId, versionToken, access.values(), WireTime.parse(createdAt), WireTime.parse(updatedAt),
            encounterId, patientId, status, currentVersion, current.domain(), reviewedVersion)
    }
    override fun toString() = "RecordDto(REDACTED)"
}
@Serializable internal data class EncounterReadDto(val data: EncounterDto) { override fun toString() = "EncounterReadDto(REDACTED)" }
@Serializable internal data class RecordReadDto(val data: RecordDto) { override fun toString() = "RecordReadDto(REDACTED)" }
@Serializable internal data class ClinicalPageDto(val nextCursor: String?, val hasMore: Boolean)
@Serializable internal data class EncountersDto(val data: List<EncounterDto>, val page: ClinicalPageDto) {
    override fun toString() = "EncountersDto(REDACTED)"
}
