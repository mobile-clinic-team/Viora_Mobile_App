package com.viora.mobile.core.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.StoredCredential
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.security.KeyStore
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class KeystoreSecureStore(context: Context, private val io: CoroutineDispatcher = Dispatchers.IO) : SecureStore {
    private val directory = context.noBackupFilesDir
    private val packageId = context.packageName
    private val mutex = Mutex()
    private val json = Json { ignoreUnknownKeys = false; encodeDefaults = true }
    private val credentials = AtomicFile(File(directory, "credentials.enc"))
    private val receipts = AtomicFile(File(directory, "receipts.enc"))

    @Serializable private data class Envelope(val schemaVersion: Int, val iv: String, val ciphertext: String)

    override suspend fun readCredential(): StoredCredential? = guarded {
        read(credentials, "credentials")?.let { json.decodeFromString<StoredCredential>(it).also(StoredCredential::validate) }
    }
    override suspend fun writeCredential(value: StoredCredential) = guarded {
        value.validate()
        write(credentials, "credentials", json.encodeToString(value))
    }
    override suspend fun readReceipts(): List<OperationReceipt> = guarded {
        read(receipts, "receipts")?.let { json.decodeFromString<List<OperationReceipt>>(it) }.orEmpty().also { values ->
            require(values.size <= 16 && values.map { it.operationId }.distinct().size == values.size)
            values.forEach(OperationReceipt::validate)
        }
    }
    override suspend fun writeReceipts(values: List<OperationReceipt>) = guarded {
        require(values.size <= 16 && values.map { it.operationId }.distinct().size == values.size)
        values.forEach(OperationReceipt::validate)
        write(receipts, "receipts", json.encodeToString(values))
    }
    override suspend fun clear() = withContext(io) { mutex.withLock { erase() } }

    private suspend fun <T> guarded(block: () -> T): T = withContext(io) {
        mutex.withLock {
            try { block() } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (_: Exception) {
                erase()
                throw SecureStoreException()
            }
        }
    }
    private fun key(create: Boolean): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        // A missing key with existing data is key loss, even on a write/rotation.
        check(create && !credentials.baseFile.exists() && !receipts.baseFile.exists())
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256).setRandomizedEncryptionRequired(true).build())
        }.generateKey()
    }
    private fun read(file: AtomicFile, purpose: String): String? {
        if (!file.baseFile.exists() && !File(file.baseFile.path + ".bak").exists()) return null
        val envelope = file.openRead().use { stream ->
            val output = java.io.ByteArrayOutputStream()
            val buffer = ByteArray(4096)
            while (output.size() <= 65536) {
                val count = stream.read(buffer)
                if (count == -1) break
                output.write(buffer, 0, count)
            }
            val bytes = output.toByteArray()
            require(bytes.size <= 65536)
            json.decodeFromString<Envelope>(bytes.decodeToString(throwOnInvalidSequence = true))
        }
        require(envelope.schemaVersion == 1)
        val iv = Base64.getDecoder().decode(envelope.iv)
        require(iv.size == 12)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(false), GCMParameterSpec(128, iv))
        cipher.updateAAD(aad(purpose))
        return cipher.doFinal(Base64.getDecoder().decode(envelope.ciphertext)).decodeToString(throwOnInvalidSequence = true)
    }
    private fun write(file: AtomicFile, purpose: String, value: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key(true))
        cipher.updateAAD(aad(purpose))
        val envelope = Envelope(1, Base64.getEncoder().encodeToString(cipher.iv),
            Base64.getEncoder().encodeToString(cipher.doFinal(value.toByteArray(Charsets.UTF_8))))
        val stream = file.startWrite()
        try {
            stream.write(json.encodeToString(envelope).toByteArray(Charsets.UTF_8))
            file.finishWrite(stream)
        } catch (failure: Exception) {
            file.failWrite(stream)
            throw failure
        }
    }
    private fun aad(purpose: String): ByteArray = "$packageId|1|$purpose".toByteArray(Charsets.UTF_8)
    private fun erase() {
        credentials.delete()
        receipts.delete()
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(ALIAS) }
    }
    companion object { const val ALIAS = "viora.storage.v1" }
}
