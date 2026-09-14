package com.viora.mobile.feature.doctors.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.feature.patients.domain.*
import java.time.Instant

class Doctor(
    val id: String, val workspaceId: String, val displayName: String,
    val specialization: String?, val departmentName: String?, val locationIds: Set<String>,
    val status: String, val bio: String?, val allowedActions: Set<String>,
) {
    init {
        require(Ids.valid(id) && Ids.valid(workspaceId)); text(displayName, 200)
        specialization?.let { text(it, 200) }; departmentName?.let { text(it, 200) }
        bio?.let { text(it, 2000, true) }; require(locationIds.size <= 200 && locationIds.all(Ids::valid))
        require(allowedActions.size <= 128); text(status, 64)
    }
    val supported: Boolean get() = status in setOf("ACTIVE", "INACTIVE", "SUSPENDED")
    override fun toString() = "Doctor(REDACTED)"
}

class DoctorQuery(query: String? = null, val locationId: String? = null,
    val status: String? = null, val page: PageRequest = PageRequest()) {
    val query = query?.trim()?.also { text(it, 100); require(it.codePointCount(0, it.length) >= 2) }
    init {
        locationId?.let { require(Ids.valid(it)) }
        require(status == null || status in setOf("ACTIVE", "INACTIVE", "SUSPENDED"))
    }
    override fun toString() = "DoctorQuery(REDACTED)"
}

data class Shift(val id: String, val workspaceId: String, val doctorId: String, val locationId: String,
    val startsAt: Instant, val endsAt: Instant, val status: String) {
    init {
        require(listOf(id, workspaceId, doctorId, locationId).all(Ids::valid))
        require(startsAt < endsAt && status == "ACTIVE")
    }
}

interface DoctorDirectory {
    suspend fun doctors(query: DoctorQuery): ApiResult<DirectoryPage<Doctor>>
    suspend fun doctor(id: String): ApiResult<Doctor>
    suspend fun shifts(id: String, from: Instant, to: Instant, locationId: String? = null,
        page: PageRequest = PageRequest()): ApiResult<DirectoryPage<Shift>>
}
