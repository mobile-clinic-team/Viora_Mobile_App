package com.viora.mobile.feature.doctors

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.OperationalFixture
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.doctors.domain.*
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test

class DoctorDirectoryTest {
    @Test fun directoryFilterDetailAndShiftRead() = runTest {
        val f = OperationalFixture(); val backend = f.backend()
        assertEquals(f.doctorId, (backend.doctors(DoctorQuery(locationId = f.locationId, status = "ACTIVE")) as ApiResult.Success).value.items.single().id)
        assertTrue((backend.doctors(DoctorQuery(status = "INACTIVE")) as ApiResult.Success).value.items.isEmpty())
        assertEquals(f.doctorId, (backend.doctor(f.doctorId) as ApiResult.Success).value.id)
        assertEquals(1, (backend.shifts(f.doctorId, f.clock.now(), f.clock.now().plusSeconds(86400)) as ApiResult.Success).value.items.size)
    }
    @Test fun denialAndReadFailureStaySafe() = runTest {
        val f = OperationalFixture(); val backend = f.backend(); backend.failNextRead = true
        assertTrue(backend.doctors(DoctorQuery()) is ApiResult.Failure)
        f.context = f.context.copy(permissions = emptySet())
        assertEquals(403, (backend.doctor(f.doctorId) as ApiResult.Failure).status)
    }
    @Test fun pickerReturnsOnlyIdOnceAndCannotSurviveScopeChange() {
        var epoch = 1L to 1L; val registry = PickerHandles { epoch }; var selected: String? = null
        val f = OperationalFixture(); val handle = registry.open(PickerKind.DOCTOR) { selected = it }
        assertFalse(registry.select(handle, PickerKind.PATIENT, f.patientId))
        val live = registry.open(PickerKind.DOCTOR) { selected = it }
        assertTrue(registry.select(live, PickerKind.DOCTOR, f.doctorId)); assertEquals(f.doctorId, selected)
        assertFalse(registry.select(live, PickerKind.DOCTOR, f.doctorId))
        val stale = registry.open(PickerKind.DOCTOR) { selected = it }; epoch = 1L to 2L
        assertFalse(registry.select(stale, PickerKind.DOCTOR, f.doctorId))
        assertFalse(PickerHandles { epoch }.alive(stale, PickerKind.DOCTOR))
    }
}
