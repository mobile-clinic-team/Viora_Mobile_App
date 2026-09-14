package com.viora.mobile.core.time

import java.time.Instant

interface AppClock {
    fun now(): Instant
    fun elapsedMillis(): Long
    fun synchronize(serverTime: Instant)
}
