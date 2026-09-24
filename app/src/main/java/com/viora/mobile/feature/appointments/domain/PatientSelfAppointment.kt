package com.viora.mobile.feature.appointments.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import java.time.Instant

data class PatientSelfAppointment(
    val id: String, val clinicName: String, val doctorName: String, val locationName: String,
    val startsAt: Instant, val endsAt: Instant, val status: String, val reason: String,
) {
    init {
        require(Ids.valid(id) && startsAt < endsAt)
        require(listOf(clinicName, doctorName, locationName, status).all { it.isNotBlank() && it.length <= 200 })
        require(reason.length <= 1000)
    }
}

data class PatientSelfAppointmentPage(val items: List<PatientSelfAppointment>, val nextCursor: String?)

interface PatientSelfAppointmentRepository {
    suspend fun list(cursor: String? = null): ApiResult<PatientSelfAppointmentPage>
}
