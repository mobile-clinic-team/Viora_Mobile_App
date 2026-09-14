package com.viora.mobile.feature.clinical.data

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import java.time.Instant

/** Versioned fictional dataset, independent of wall clock. It never supplies production role policy. */
object SyntheticClinicalData {
    const val WORKSPACE_A = "22222222-2222-4222-8222-222222222222"
    const val WORKSPACE_B = "33333333-3333-4333-8333-333333333333"
    const val PATIENT_A = "63333333-3333-4333-8333-333333333333"
    const val PATIENT_B = "64444444-4444-4444-8444-444444444444"
    const val DOCTOR_A = "65555555-5555-4555-8555-555555555555"
    const val APPOINTMENT = "81111111-1111-4111-8111-111111111111"
    const val ENCOUNTER = "82222222-2222-4222-8222-222222222222"
    const val EMPTY_ENCOUNTER = "83333333-3333-4333-8333-333333333333"
    const val RECORD = "84444444-4444-4444-8444-444444444444"
    const val VERSION = "85555555-5555-4555-8555-555555555555"
    const val ENCOUNTER_B = "86666666-6666-4666-8666-666666666666"
    const val RECORD_B = "87777777-7777-4777-8777-777777777777"
    const val VERSION_B = "88888888-8888-4888-8888-888888888888"
    private const val AUTHOR = "11111111-1111-4111-8111-111111111111"
    private val time = Instant.parse("2026-09-09T00:00:00.000Z")
    val encounters = listOf(
        Encounter(ENCOUNTER, WORKSPACE_A, "\"clinical-demo-enc-1\"", setOf("encounter.read"), time, time,
            PATIENT_A, DOCTOR_A, APPOINTMENT, RECORD, "IN_PROGRESS", time, null),
        Encounter(EMPTY_ENCOUNTER, WORKSPACE_A, "\"clinical-demo-empty-1\"", setOf("encounter.read"), time.minusSeconds(86400), time,
            PATIENT_A, null, null, null, "OPEN", null, null),
        Encounter(ENCOUNTER_B, WORKSPACE_B, "\"clinical-demo-enc-b\"", setOf("encounter.read"), time, time,
            PATIENT_B, null, null, RECORD_B, "IN_PROGRESS", time, null),
    )
    private fun record(id: String, workspace: String, patient: String, encounter: String, version: String, clinic: String) =
        ClinicalRecord(id, workspace, "\"clinical-demo-record-7\"", setOf("record.read"), time, time,
            encounter, patient, "DRAFT", "7", RecordVersion(version, id, "7",
                ClinicalContent("Synthetic training case — no confirmed diagnosis", "Fictional report of mild fatigue for demonstration.",
                    "Synthetic " + clinic + " encounter note. No real patient information.", "Demonstration plan only; no care instruction."),
                "EDIT", AUTHOR, time, null, null), null)
    val records = listOf(record(RECORD, WORKSPACE_A, PATIENT_A, ENCOUNTER, VERSION, "Willow"),
        record(RECORD_B, WORKSPACE_B, PATIENT_B, ENCOUNTER_B, VERSION_B, "Harbor"))
}

/** Synthetic read service only. Snapshot, grant and epoch checks apply even to direct test calls. */
class SyntheticClinicalReadRepository(private val session: SessionPort) : ClinicalReadRepository {
    private val mutex = Mutex()
    var nextFailure: ApiResult.Failure? = null
    var beforeRead: (suspend () -> Unit)? = null
    override suspend fun encounter(id: String): ApiResult<Encounter> = read("encounter.read") { workspace ->
        SyntheticClinicalData.encounters.find { it.id == id && it.workspaceId == workspace }?.let { ApiResult.Success(it) }
            ?: ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
    }
    override suspend fun record(id: String): ApiResult<ClinicalRecord> = read("record.read") { workspace ->
        SyntheticClinicalData.records.find { it.id == id && it.workspaceId == workspace }?.let { ApiResult.Success(it) }
            ?: ApiResult.Failure("RESOURCE_NOT_FOUND", 404)
    }
    override suspend fun encounters(patient: PatientReference, page: PageRequest): ApiResult<DirectoryPage<Encounter>> = read("encounter.read") { workspace ->
        if (patient.workspaceId != workspace) return@read ApiResult.StaleScope
        val rows = SyntheticClinicalData.encounters.filter { it.workspaceId == workspace && it.patientId == patient.patientId }
            .sortedWith(compareByDescending<Encounter> { it.createdAt }.thenByDescending { it.id })
        // Only a fixture cursor; binds the complete synthetic query and validated permission revision.
        val prefix = workspace + ":" + patient.patientId + ":" + session.state.value.workspace!!.permissionRevision + ":" + page.limit + ":"
        val start = page.cursor?.let {
            if (!it.startsWith(prefix)) return@read ApiResult.Failure("INVALID_CURSOR", 400)
            it.removePrefix(prefix).toIntOrNull() ?: return@read ApiResult.Failure("INVALID_CURSOR", 400)
        } ?: 0
        if (start !in 0..rows.size) return@read ApiResult.Failure("INVALID_CURSOR", 400)
        val selected = rows.drop(start).take(page.limit)
        val next = start + selected.size
        ApiResult.Success(DirectoryPage(selected, if (next < rows.size) prefix + next else null))
    }
    private suspend fun <T> read(permission: String, read: (String) -> ApiResult<T>): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.Failure("UNAUTHENTICATED", 401)
        val workspace = snapshot.workspace ?: return ApiResult.StaleScope
        if (!workspace.allows(permission)) return ApiResult.Failure("FORBIDDEN", 403)
        beforeRead?.invoke()
        if (!session.matches(snapshot)) return ApiResult.StaleScope
        val failure = mutex.withLock { nextFailure.also { nextFailure = null } }
        val result = failure ?: read(workspace.id)
        return if (session.matches(snapshot)) result else ApiResult.StaleScope
    }
}
