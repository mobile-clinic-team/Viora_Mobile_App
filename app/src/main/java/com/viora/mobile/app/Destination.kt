package com.viora.mobile.app

import kotlinx.serialization.Serializable

@Serializable data object Dashboard
@Serializable data object Patients
@Serializable data object Schedule
@Serializable data object Assistant
@Serializable data object Account
@Serializable data object Doctors
/** ID-only placeholder route owned by the platform until Member C supplies clinical destinations. */
@Serializable data class ClinicalEntryPlaceholderRoute(
    val patientId: String? = null,
    val appointmentId: String? = null,
    val encounterId: String? = null,
)
