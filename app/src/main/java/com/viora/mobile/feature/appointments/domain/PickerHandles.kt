package com.viora.mobile.feature.appointments.domain

import com.viora.mobile.core.model.Ids

enum class PickerKind { PATIENT, DOCTOR }

/** Destination-owned, memory-only handles. Never reconstruct from a route or saved state. */
class PickerHandles(private val epoch: () -> Pair<Long, Long>) {
    private data class Pending(val kind: PickerKind, val epoch: Pair<Long, Long>, val accept: (String) -> Unit)
    private val values = mutableMapOf<String, Pending>()
    fun open(kind: PickerKind, accept: (String) -> Unit): String = Ids.newId().also { values[it] = Pending(kind, epoch(), accept) }
    fun alive(handle: String, kind: PickerKind): Boolean = values[handle]?.let { it.kind == kind && it.epoch == epoch() } == true
    fun select(handle: String, kind: PickerKind, id: String): Boolean {
        if (!Ids.valid(id) || !alive(handle, kind)) { values.remove(handle); return false }
        values.remove(handle)!!.accept(id)
        return true
    }
    fun cancel(handle: String) { values.remove(handle) }
    fun clear() = values.clear()
}
