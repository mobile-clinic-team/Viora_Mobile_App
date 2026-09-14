package com.viora.mobile.feature.appointments.domain

import java.time.*

/** Time conversion is technical; no occupancy, slot length or eligibility is inferred here. */
object Scheduling {
    fun clinicDay(date: LocalDate, zone: ZoneId): Pair<Instant, Instant> =
        date.atStartOfDay(zone).toInstant() to date.plusDays(1).atStartOfDay(zone).toInstant()

    fun offsets(local: LocalDateTime, zone: ZoneId): List<ZoneOffset> = zone.rules.getValidOffsets(local)

    fun instant(local: LocalDateTime, zone: ZoneId, selectedOffset: ZoneOffset? = null): Instant {
        val valid = offsets(local, zone)
        require(valid.isNotEmpty()) { "LOCAL_TIME_GAP" }
        val selected = selectedOffset ?: valid.singleOrNull() ?: error("OFFSET_CHOICE_REQUIRED")
        require(selected in valid) { "INVALID_OFFSET" }
        return local.toInstant(selected)
    }
}

/** Policy approval cannot be inferred from an empty blockedDecisionIds array. */
data class SchedulingCapability(val available: Boolean, val blockedDecisionIds: Set<String>) {
    companion object { val Unavailable = SchedulingCapability(false, setOf("BD-01", "BD-03")) }
}
