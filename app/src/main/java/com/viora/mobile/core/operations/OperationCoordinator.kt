package com.viora.mobile.core.operations

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.security.SecureStore
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.time.AppClock
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Metadata admission only. No write payload, worker, or automatic replay exists. */
interface OperationPort {
    suspend fun prepare(): OperationReceipt
    suspend fun outstanding(): List<OperationReceipt>
    suspend fun acknowledgeResolved(operationId: String)
}

class OperationCoordinator(private val session: SessionPort, private val store: SecureStore, private val clock: AppClock) : OperationPort {
    private val mutex = Mutex()
    override suspend fun prepare(): OperationReceipt {
        val snapshot = requireNotNull(session.snapshot())
        return session.withCurrent(snapshot) {
            mutex.withLock {
                val previous = store.readReceipts()
                check(previous.size < 16) { "Reconcile outstanding operations first" }
                val now = clock.now()
                val receipt = OperationReceipt(Ids.newId(), snapshot.userId, snapshot.workspace!!.id,
                    com.viora.mobile.core.time.WireTime.format(now), com.viora.mobile.core.time.WireTime.format(now.plusSeconds(86400)))
                store.writeReceipts(previous + receipt)
                receipt
            }
        }
    }
    override suspend fun outstanding(): List<OperationReceipt> {
        val snapshot = session.snapshot() ?: return emptyList()
        return session.withCurrent(snapshot) {
            store.readReceipts().filter { it.ownerUserId == snapshot.userId && it.workspaceId == snapshot.workspace!!.id }
        }
    }
    override suspend fun acknowledgeResolved(operationId: String) {
        val snapshot = session.snapshot() ?: return
        session.withCurrent(snapshot) {
            mutex.withLock {
                val receipts = store.readReceipts()
                check(receipts.any { it.operationId == operationId && it.ownerUserId == snapshot.userId && it.workspaceId == snapshot.workspace!!.id })
                store.writeReceipts(receipts.filterNot { it.operationId == operationId })
            }
        }
    }
}
