package com.viora.mobile.feature.patients

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.OperationalFixture
import com.viora.mobile.feature.patients.domain.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class PatientDirectoryTest {
    @Test fun searchDetailEmptyErrorAndRetryAreDistinct() = runTest {
        val f = OperationalFixture(); val backend = f.backend()
        assertEquals(f.patientId, (backend.search(PatientSearch("  Synthetic  ")) as ApiResult.Success).value.items.single().id)
        assertEquals(f.patientId, (backend.patient(f.patientId) as ApiResult.Success).value.id)
        assertTrue((backend.search(PatientSearch("absent")) as ApiResult.Success).value.items.isEmpty())
        backend.failNextRead = true
        assertEquals("TRANSPORT_ERROR", (backend.search(PatientSearch("Synthetic")) as ApiResult.Failure).code)
        assertTrue(backend.search(PatientSearch("Synthetic")) is ApiResult.Success)
    }
    @Test fun deniedWorkspaceNeverReturnsPatientOrTreatsFailureAsEmpty() = runTest {
        val f = OperationalFixture(); val backend = f.backend()
        f.context = f.context.copy(permissions = emptySet())
        assertEquals(403, (backend.search(PatientSearch("Synthetic")) as ApiResult.Failure).status)
        assertEquals(403, (backend.patient(f.patientId) as ApiResult.Failure).status)
    }
    @Test fun patientQueryIsRequiredBoundedAndRedacted() {
        listOf("", "x", "x".repeat(101), "ab\n").forEach { value ->
            if (value != "ab\n") assertThrows(IllegalArgumentException::class.java) { PatientSearch(value) }
        }
        assertEquals(100, PatientSearch("😀".repeat(100)).query.codePointCount(0, 200))
        assertEquals("PatientSearch(REDACTED)", PatientSearch("Synthetic").toString())
        assertEquals("Patient(REDACTED)", OperationalFixture().patient.toString())
    }
}
