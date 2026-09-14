package com.viora.mobile.feature.patients.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import java.time.Instant
import java.time.LocalDate

/** Absence is an authorization projection, distinct from an explicitly empty value. */
sealed interface PatientField<out T> {
    data object Withheld : PatientField<Nothing>
    class Disclosed<T>(val value: T?) : PatientField<T> {
        override fun toString() = "Disclosed(REDACTED)"
    }
}

class EmergencyContact(val name: String, val phone: String, val relationship: String?) {
    init { text(name, 200); text(phone, 40); relationship?.let { text(it, 100) } }
    override fun toString() = "EmergencyContact(REDACTED)"
}

class Patient(
    val id: String, val workspaceId: String, val versionToken: String,
    val allowedActions: Set<String>, val createdAt: Instant, val updatedAt: Instant,
    val medicalRecordNumber: String, val fullName: String,
    val dateOfBirth: PatientField<LocalDate> = PatientField.Withheld,
    val sex: PatientField<String> = PatientField.Withheld,
    val phone: PatientField<String> = PatientField.Withheld,
    val email: PatientField<String> = PatientField.Withheld,
    val address: PatientField<String> = PatientField.Withheld,
    val emergencyContact: PatientField<EmergencyContact> = PatientField.Withheld,
    val status: PatientField<String> = PatientField.Withheld,
) {
    init {
        require(Ids.valid(id) && Ids.valid(workspaceId) && VersionToken.valid(versionToken))
        text(fullName, 200); text(medicalRecordNumber, 80); require(allowedActions.size <= 128)
    }
    fun reference() = PatientReference(id, workspaceId)
    fun project(readable: Set<String>) = Patient(id, workspaceId, versionToken, allowedActions, createdAt, updatedAt, medicalRecordNumber, fullName,
        if ("dateOfBirth" in readable) dateOfBirth else PatientField.Withheld,
        if ("sex" in readable) sex else PatientField.Withheld,
        if ("phone" in readable) phone else PatientField.Withheld,
        if ("email" in readable) email else PatientField.Withheld,
        if ("address" in readable) address else PatientField.Withheld,
        if ("emergencyContact" in readable) emergencyContact else PatientField.Withheld,
        if ("status" in readable) status else PatientField.Withheld)
    override fun toString() = "Patient(REDACTED)"
}

data class PatientReference(val patientId: String, val workspaceId: String) {
    init { require(Ids.valid(patientId) && Ids.valid(workspaceId)) }
}

/** A bounded page is never a total count or a complete clinical history. */
class DirectoryPage<T>(val items: List<T>, val nextCursor: String?) {
    init { require(items.size <= 100); nextCursor?.let { require(it.length in 1..2048) } }
    override fun toString() = "DirectoryPage(REDACTED)"
}

data class PageRequest(val limit: Int = 20, val cursor: String? = null) {
    init { require(limit in 1..100); cursor?.let { require(it.length in 1..2048) } }
}

class PatientSearch(query: String, val page: PageRequest = PageRequest()) {
    val query = query.trim().also { text(it, 100); require(it.codePointCount(0, it.length) >= 2) }
    override fun toString() = "PatientSearch(REDACTED)"
}

interface PatientDirectory {
    suspend fun search(query: PatientSearch): ApiResult<DirectoryPage<Patient>>
    suspend fun patient(id: String): ApiResult<Patient>
}

/** Technical bounds only; BD-02 owns catalogues, MRN allocation and required fields. */
fun text(value: String, max: Int, multiline: Boolean = false) {
    require(value.codePointCount(0, value.length) <= max)
    require(value.none { it.isISOControl() && !(multiline && it in "\n\t") })
}
