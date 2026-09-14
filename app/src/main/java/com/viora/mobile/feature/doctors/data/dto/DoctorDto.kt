package com.viora.mobile.feature.doctors.data.dto

import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.doctors.domain.*
import kotlinx.serialization.Serializable

@Serializable internal data class DoctorAccessDto(val allowedActions: List<String>)
@Serializable internal data class DoctorDto(val id: String, val workspaceId: String, val displayName: String,
    val specialization: String?, val departmentName: String?, val locationIds: List<String>,
    val status: String, val bio: String?, val access: DoctorAccessDto) {
    fun domain(workspace: String): Doctor {
        require(workspaceId == workspace && locationIds.distinct().size == locationIds.size)
        require(access.allowedActions.distinct().size == access.allowedActions.size)
        return Doctor(id, workspaceId, displayName, specialization, departmentName, locationIds.toSet(), status, bio, access.allowedActions.toSet())
    }
    override fun toString() = "DoctorDto(REDACTED)"
}
@Serializable internal data class ShiftDto(val id: String, val workspaceId: String, val doctorId: String,
    val locationId: String, val startsAt: String, val endsAt: String, val status: String) {
    fun domain(workspace: String, doctor: String): Shift {
        require(workspaceId == workspace && doctorId == doctor)
        return Shift(id, workspaceId, doctorId, locationId, WireTime.parse(startsAt), WireTime.parse(endsAt), status)
    }
}
@Serializable internal data class DoctorPageDto(val nextCursor: String?, val hasMore: Boolean)
@Serializable internal data class DoctorListDto(val data: List<DoctorDto>, val page: DoctorPageDto)
@Serializable internal data class DoctorReadDto(val data: DoctorDto)
@Serializable internal data class ShiftListDto(val data: List<ShiftDto>, val page: DoctorPageDto)
