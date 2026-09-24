package com.viora.mobile.feature.appointments.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.operations.OperationReceipt
import java.time.Instant

data class PatientBookingOption(val doctorId: String, val locationId: String, val doctorName: String,
    val locationName: String, val clinicName: String, val startsAt: Instant) {
    val endsAt: Instant get() = startsAt.plusSeconds(30 * 60)
    init {
        require(Ids.valid(doctorId) && Ids.valid(locationId))
        require(listOf(doctorName, locationName, clinicName).all { it.isNotBlank() && it.length <= 200 })
    }
}

data class PatientBookingIntent(val option: PatientBookingOption, val reason: String) {
    init { require(reason.isNotBlank() && reason.length <= 1000) }
    override fun toString() = "PatientBookingIntent(REDACTED)"
}

interface PatientBookingRepository {
    suspend fun options(): ApiResult<List<PatientBookingOption>>
    suspend fun create(intent: PatientBookingIntent, operation: OperationReceipt): ApiResult<AppointmentWrite>
    suspend fun recover(operation: OperationReceipt): ApiResult<AppointmentWrite>
}
