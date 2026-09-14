package com.viora.mobile.core.security

import com.viora.mobile.core.session.StoredCredential
import com.viora.mobile.core.operations.OperationReceipt

interface SecureStore {
    suspend fun readCredential(): StoredCredential?
    suspend fun writeCredential(value: StoredCredential)
    suspend fun readReceipts(): List<OperationReceipt>
    suspend fun writeReceipts(values: List<OperationReceipt>)
    suspend fun clear()
}
class SecureStoreException : Exception("Secure storage unavailable")
