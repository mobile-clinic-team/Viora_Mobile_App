package com.viora.mobile.feature.clinical

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.clinical.data.SyntheticClinicalData as Data
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.clinical.ui.*
import com.viora.mobile.feature.patients.domain.PatientReference
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import kotlinx.serialization.json.Json
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ClinicalContextTest {
    @Test fun patientHistoryAppointmentLinkAndRecordShareValidatedReferences() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val entry = (f.reader.entry(Data.PATIENT_A) as ApiResult.Success).value
        assertEquals(2, entry.encounters.items.size); assertNull(entry.appointment)
        val linked = (f.reader.entry(Data.PATIENT_A, Data.APPOINTMENT) as ApiResult.Success).value
        assertEquals(Data.ENCOUNTER, linked.encounters.items.single().id)
        assertEquals("\"clinical-demo-appointment-1\"", linked.appointment!!.appointmentVersionToken)
        val record = (f.reader.record(Data.RECORD) as ApiResult.Success).value
        assertEquals(Data.ENCOUNTER, record.encounter.encounter.id)
        assertEquals(Data.PATIENT_A, record.encounter.patient.id)
        assertEquals(Data.APPOINTMENT, record.encounter.appointment!!.appointmentId)
        assertEquals(Data.RECORD, record.record.reference().recordId)
    }
    @Test fun absentLinksStayEmptyWithoutCreatingEncounterOrRecord() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val before = (f.repository.encounters(PatientReference(Data.PATIENT_A, Data.WORKSPACE_A)) as ApiResult.Success).value.items.size
        val entry = (f.reader.entry(Data.PATIENT_A, "69999999-9999-4999-8999-999999999999") as ApiResult.Success).value
        assertTrue(entry.encounters.items.isEmpty())
        assertNull((f.reader.encounter(Data.EMPTY_ENCOUNTER) as ApiResult.Success).value.encounter.recordId)
        assertEquals(before, (f.repository.encounters(PatientReference(Data.PATIENT_A, Data.WORKSPACE_A)) as ApiResult.Success).value.items.size)
    }
    @Test fun mismatchedRecordParentFailsWithoutPublishingContent() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val original = (f.repository.record(Data.RECORD) as ApiResult.Success).value
        val overbroad = object : ClinicalReadRepository by f.repository {
            override suspend fun record(id: String): ApiResult<ClinicalRecord> = ApiResult.Success(ClinicalRecord(
                original.id, original.workspaceId, original.versionToken, original.allowedActions, original.createdAt,
                original.updatedAt, Data.EMPTY_ENCOUNTER, original.patientId, original.status, original.currentVersion, original.current, null))
        }
        val reader = ClinicalReader(overbroad, f.operational.patients, f.operational.appointments, f.session)
        assertEquals("INVALID_CLINICAL_CONTEXT", (reader.record(Data.RECORD) as ApiResult.Failure).code)
        assertTrue(f.reader.entry(Data.PATIENT_B, Data.APPOINTMENT) is ApiResult.Failure)
        assertTrue(f.reader.encounter("not-an-id") is ApiResult.Failure)
    }
    @Test fun adapterUsesOnlyIdsAndRejectsMissingSessionOtherWorkspaceAndDeniedGrant() = runTest {
        val f = ClinicalFixture(backgroundScope); var route: Any? = null
        val adapter = ClinicalNavigationAdapter(f.session) { route = it }
        val entry = EncounterEntry.Create(PatientReference(Data.PATIENT_A, Data.WORKSPACE_A), Data.APPOINTMENT)
        adapter.open(entry); assertNull(route)
        f.login(); adapter.open(entry)
        assertEquals(ClinicalEntryRoute(Data.PATIENT_A, Data.APPOINTMENT), route)
        assertEquals(setOf("patientId", "appointmentId"), Json.parseToJsonElement(Json.encodeToString(ClinicalEntryRoute.serializer(), route as ClinicalEntryRoute)).let {
            (it as kotlinx.serialization.json.JsonObject).keys
        })
        route = null; adapter.open(EncounterEntry.Existing("malformed")); assertNull(route)
        adapter.open(EncounterEntry.Create(PatientReference(Data.PATIENT_B, Data.WORKSPACE_B))); assertNull(route)
        adapter.open(EncounterEntry.Existing(Data.ENCOUNTER)); assertEquals(ClinicalEncounterRoute(Data.ENCOUNTER), route)
        route = null; f.session.selectWorkspace(Data.WORKSPACE_B); adapter.open(entry); assertNull(route)
    }
    @Test fun syntheticLateReadIsRejectedAndSensitiveModelsAreRedacted() = runTest {
        val f = ClinicalFixture(backgroundScope); f.login()
        val record = (f.reader.record(Data.RECORD) as ApiResult.Success).value
        listOf(record, record.record, record.record.current, record.record.current.content, record.record.reference(), record.encounter).forEach {
            assertTrue(it.toString().endsWith("(REDACTED)")); assertFalse(it.toString().contains("fatigue"))
        }
        val gate = CompletableDeferred<Unit>()
        f.repository.beforeRead = { gate.await() }
        val pending = async { f.repository.record(Data.RECORD) }; runCurrent()
        f.session.logout(); gate.complete(Unit)
        assertEquals(ApiResult.StaleScope, pending.await())
    }
}
