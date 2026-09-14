package com.viora.mobile.feature.patients.data.dto

import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.patients.domain.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.time.LocalDate

private val omittedPatientField: JsonElement = JsonObject(emptyMap())

@Serializable internal data class PatientAccessDto(val allowedActions: List<String>)
@Serializable internal data class PatientDto(
    val id: String, val workspaceId: String, val versionToken: String, val access: PatientAccessDto,
    val createdAt: String, val updatedAt: String, val medicalRecordNumber: String, val fullName: String,
    val dateOfBirth: JsonElement = omittedPatientField, val sex: JsonElement = omittedPatientField, val phone: JsonElement = omittedPatientField,
    val email: JsonElement = omittedPatientField, val address: JsonElement = omittedPatientField, val emergencyContact: JsonElement = omittedPatientField,
    val status: JsonElement = omittedPatientField,
) {
    fun domain(workspace: String, readable: Set<String>): Patient {
        require(workspaceId == workspace && access.allowedActions.distinct().size == access.allowedActions.size)
        fun string(value: JsonElement, max: Int): String {
            require(value is JsonPrimitive && value.isString)
            return value.content.also { text(it, max) }
        }
        fun <T> field(name: String, value: JsonElement, parse: (JsonElement) -> T): PatientField<T> {
            if (name !in readable) return PatientField.Withheld
            require(value !== omittedPatientField) { "MISSING_FIELD" }
            return PatientField.Disclosed(if (value == JsonNull) null else parse(value))
        }
        require(status != JsonNull || "status" !in readable)
        return Patient(id, workspaceId, versionToken, access.allowedActions.toSet(), WireTime.parse(createdAt),
            WireTime.parse(updatedAt), medicalRecordNumber, fullName,
            field("dateOfBirth", dateOfBirth) { val raw = string(it, 10); require(Regex("\\d{4}-\\d{2}-\\d{2}").matches(raw)); LocalDate.parse(raw) },
            field("sex", sex) { string(it, 64) }, field("phone", phone) { string(it, 40) },
            field("email", email) { string(it, 254) }, field("address", address) { string(it, 1000) },
            field("emergencyContact", emergencyContact) {
                val obj = it.jsonObject
                require(obj.containsKey("relationship"))
                EmergencyContact(string(obj.getValue("name"), 200), string(obj.getValue("phone"), 40),
                    obj.getValue("relationship").let { value -> if (value == JsonNull) null else string(value, 100) })
            }, field("status", status) { string(it, 64) })
    }
    override fun toString() = "PatientDto(REDACTED)"
}
@Serializable internal data class PatientPageDto(val nextCursor: String?, val hasMore: Boolean)
@Serializable internal data class PatientListDto(val data: List<PatientDto>, val page: PatientPageDto)
@Serializable internal data class PatientReadDto(val data: PatientDto)
