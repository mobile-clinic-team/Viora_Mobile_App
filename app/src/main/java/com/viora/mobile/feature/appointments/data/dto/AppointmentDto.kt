package com.viora.mobile.feature.appointments.data.dto

import com.viora.mobile.core.model.*
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.appointments.domain.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull

@Serializable internal data class AppointmentAccessDto(val allowedActions: List<String>)
@Serializable internal data class AppointmentDto(
    val id: String, val workspaceId: String, val versionToken: String, val access: AppointmentAccessDto,
    val createdAt: String, val updatedAt: String, val patientId: String, val doctorId: String,
    val locationId: String, val startsAt: String, val endsAt: String, val status: String,
    val checkedInAt: String?, val reason: String?, val notes: String?, val encounterId: String?,
) {
    fun domain(workspace: String): Appointment {
        require(workspaceId == workspace && access.allowedActions.distinct().size == access.allowedActions.size)
        return Appointment(id, workspaceId, versionToken, access.allowedActions.toSet(), WireTime.parse(createdAt),
            WireTime.parse(updatedAt), patientId, doctorId, locationId, WireTime.parse(startsAt), WireTime.parse(endsAt),
            status, checkedInAt?.let(WireTime::parse), reason, notes, encounterId)
    }
    override fun toString() = "AppointmentDto(REDACTED)"
}
@Serializable internal data class AppointmentPageDto(val nextCursor: String?, val hasMore: Boolean)
@Serializable internal data class AppointmentListDto(val data: List<AppointmentDto>, val page: AppointmentPageDto)
@Serializable internal data class AppointmentReadDto(val data: AppointmentDto)
@Serializable internal data class AvailabilityWindowDto(val doctorId: String, val locationId: String, val startsAt: String, val endsAt: String)
@Serializable internal data class AvailabilityDto(val windows: List<AvailabilityWindowDto>, val checkedAt: String)
@Serializable internal data class AvailabilityReadDto(val data: AvailabilityDto)
@Serializable internal data class AppointmentCreateDto(val patientId: String, val doctorId: String, val locationId: String,
    val startsAt: String, val endsAt: String, val reason: String?, val notes: String?) {
    override fun toString() = "AppointmentCreateDto(REDACTED)"
}
@Serializable internal data class AppointmentRescheduleDto(val doctorId: String, val locationId: String, val startsAt: String, val endsAt: String)
@Serializable internal data class EncounterLinkDto(val encounterId: String, val encounterVersionToken: String)
@Serializable internal data class AppointmentResourceDto(val type: String, val id: String, val parentId: String?, val versionToken: String?)
@Serializable internal data class AppointmentWriteDto(val operationId: String, val state: String,
    val primary: AppointmentResourceDto, val related: List<AppointmentResourceDto>, val handoff: JsonElement?,
    val committedAt: String, val expiresAt: String) {
    fun domain(operation: String, expectedId: String?, etag: String?, linked: EncounterLink?): AppointmentWrite {
        require(operationId == operation && Ids.valid(operationId) && state == "SUCCEEDED")
        require(primary.type == "APPOINTMENT" && primary.parentId == null && Ids.valid(primary.id))
        require(expectedId == null || primary.id == expectedId)
        val version = requireNotNull(primary.versionToken)
        require(VersionToken.valid(version) && etag == version && (handoff == null || handoff == JsonNull))
        val encounter = if (linked == null) { require(related.isEmpty()); null } else {
            val ref = related.single()
            require(ref.type == "ENCOUNTER" && ref.id == linked.encounterId && ref.parentId == null)
            EncounterLink(ref.id, requireNotNull(ref.versionToken))
        }
        val committed = WireTime.parse(committedAt); val expires = WireTime.parse(expiresAt)
        require(expires == committed.plusSeconds(86400))
        return AppointmentWrite(operationId, primary.id, version, encounter, committed, expires)
    }
}
@Serializable internal data class AppointmentWriteEnvelope(val data: AppointmentWriteDto)
