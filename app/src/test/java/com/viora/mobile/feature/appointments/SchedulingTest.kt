package com.viora.mobile.feature.appointments

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.appointments.domain.*
import com.viora.mobile.feature.doctors.domain.Shift
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.*

class SchedulingTest {
    @Test fun dstGapRejectedAndOverlapRequiresAnExplicitOffset() {
        val zone = ZoneId.of("America/New_York")
        assertThrows(IllegalArgumentException::class.java) { Scheduling.instant(LocalDateTime.parse("2026-03-08T02:30"), zone) }
        val overlap = LocalDateTime.parse("2026-11-01T01:30")
        assertThrows(IllegalStateException::class.java) { Scheduling.instant(overlap, zone) }
        val offsets = Scheduling.offsets(overlap, zone)
        assertEquals(2, offsets.size)
        assertEquals(3600, Duration.between(Scheduling.instant(overlap, zone, offsets[0]), Scheduling.instant(overlap, zone, offsets[1])).seconds)
        assertThrows(IllegalArgumentException::class.java) { Scheduling.instant(overlap, zone, ZoneOffset.UTC) }
    }
    @Test fun clinicDayUsesClinicZoneAndHas23HoursAcrossSpringDst() {
        val bounds = Scheduling.clinicDay(LocalDate.parse("2026-03-08"), ZoneId.of("America/New_York"))
        assertEquals(23 * 3600, Duration.between(bounds.first, bounds.second).seconds)
        assertEquals(Instant.parse("2026-03-08T05:00:00Z"), bounds.first)
    }
    @Test fun invalidIntervalsAndOutOfBoundsQueriesReject() {
        val from = Instant.parse("2026-09-09T00:00:00Z")
        assertThrows(IllegalArgumentException::class.java) { AppointmentQuery(from, from) }
        assertThrows(IllegalArgumentException::class.java) { AppointmentQuery(from, from.plusSeconds(31 * 86400 + 1)) }
        assertThrows(IllegalArgumentException::class.java) { OperationalFixture().creation(100, 10) }
        AppointmentQuery(from, from.plusSeconds(31 * 86400))
    }
    @Test fun availabilityMergesShiftsClipsSubtractsAndKeepsAdjacentBoundaryFree() = runTest {
        val fixture = OperationalFixture()
        val overlapping = Shift("76666666-6666-4666-8666-666666666666", fixture.shift.workspaceId, fixture.doctorId, fixture.locationId,
            fixture.clock.now().plusSeconds(8000), fixture.clock.now().plusSeconds(40000), "ACTIVE")
        val backend = fixture.backend(shiftValues = listOf(fixture.shift, overlapping))
        val result = backend.availability(fixture.doctorId, fixture.locationId, fixture.clock.now().plusSeconds(5000), fixture.clock.now().plusSeconds(20000)) as ApiResult.Success
        assertEquals(listOf(5000L to 7200L, 9000L to 20000L), result.value.windows.map {
            Duration.between(fixture.clock.now(), it.startsAt).seconds to Duration.between(fixture.clock.now(), it.endsAt).seconds })
        assertTrue(backend.create(fixture.creation(9000, 10000), fixture.operation()) is ApiResult.Success)
    }
    @Test fun unresolvedPolicyDisablesAvailabilityAndCreation() = runTest {
        val f = OperationalFixture(); val backend = f.backend(policy = null)
        assertEquals("FEATURE_UNAVAILABLE", (backend.availability(f.doctorId, f.locationId, f.clock.now(), f.clock.now().plusSeconds(7200)) as ApiResult.Failure).code)
        assertEquals("FEATURE_UNAVAILABLE", (backend.create(f.creation(), f.operation()) as ApiResult.Failure).code)
    }
    @Test fun availabilityRejectsMoreThanSevenDays() = runTest {
        val f = OperationalFixture()
        assertEquals("INVALID_QUERY", (f.backend().availability(f.doctorId, f.locationId, f.clock.now(), f.clock.now().plusSeconds(7 * 86400 + 1)) as ApiResult.Failure).code)
    }
}
