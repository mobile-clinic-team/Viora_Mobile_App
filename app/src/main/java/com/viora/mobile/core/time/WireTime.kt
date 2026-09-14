package com.viora.mobile.core.time

import java.time.Instant
import java.time.format.DateTimeFormatterBuilder

object WireTime {
    private val formatter = DateTimeFormatterBuilder().appendInstant(3).toFormatter()
    fun format(value: Instant): String = formatter.format(value)
    fun parse(value: String): Instant {
        require(Regex("\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z").matches(value))
        return Instant.parse(value)
    }
}
