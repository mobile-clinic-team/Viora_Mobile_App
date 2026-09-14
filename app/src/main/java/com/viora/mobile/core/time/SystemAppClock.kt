package com.viora.mobile.core.time

import android.os.SystemClock
import java.time.Instant

class SystemAppClock : AppClock {
    private data class Anchor(val instant: Instant, val elapsed: Long)
    @Volatile private var anchor = Anchor(Instant.now(), SystemClock.elapsedRealtime())
    override fun elapsedMillis(): Long = SystemClock.elapsedRealtime()
    override fun now(): Instant = anchor.let { it.instant.plusMillis(elapsedMillis() - it.elapsed) }
    override fun synchronize(serverTime: Instant) { anchor = Anchor(serverTime, elapsedMillis()) }
}
