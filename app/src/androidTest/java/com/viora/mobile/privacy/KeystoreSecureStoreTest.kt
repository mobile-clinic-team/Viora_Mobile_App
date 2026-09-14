package com.viora.mobile.privacy

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import com.viora.mobile.core.security.KeystoreSecureStore
import com.viora.mobile.core.security.SecureStoreException
import com.viora.mobile.core.session.StoredCredential
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import android.content.Context
import java.io.File
import java.security.KeyStore

@RunWith(AndroidJUnit4::class)
class KeystoreSecureStoreTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private fun credential() = StoredCredential(1, "66666666-6666-4666-8666-666666666666",
        "11111111-1111-4111-8111-111111111111", "synthetic-private-refresh", "2026-09-09T12:00:00.000Z")
    @Test fun encryptionUsesFreshIvAndNeverPersistsPlaintext() = runBlocking {
        val store = KeystoreSecureStore(context)
        store.clear()
        try {
            store.writeCredential(credential())
            val file = File(context.noBackupFilesDir, "credentials.enc")
            val first = file.readText()
            assertFalse(first.contains("synthetic-private-refresh"))
            assertEquals(credential(), KeystoreSecureStore(context).readCredential())
            store.writeCredential(credential())
            assertNotEquals(first, file.readText())
            assertEquals(credential(), store.readCredential())
        } finally { store.clear() }
    }
    @Test fun lostKeyClearsCiphertextAndRequiresLogin() = runBlocking {
        val store = KeystoreSecureStore(context)
        store.clear(); store.writeCredential(credential())
        KeyStore.getInstance("AndroidKeyStore").apply { load(null); deleteEntry(KeystoreSecureStore.ALIAS) }
        try { store.readCredential(); fail("Key loss must fail closed") } catch (_: SecureStoreException) { }
        assertFalse(File(context.noBackupFilesDir, "credentials.enc").exists())
        assertNull(store.readCredential())
    }
    @Test fun corruptedEnvelopeIsNeverSilentlyRead() = runBlocking {
        val store = KeystoreSecureStore(context)
        store.clear(); store.writeCredential(credential())
        File(context.noBackupFilesDir, "credentials.enc").writeText("""{"schemaVersion":99,"iv":"","ciphertext":""}""")
        try { store.readCredential(); fail("Unsupported schema must fail closed") } catch (_: SecureStoreException) { }
        assertNull(store.readCredential())
    }
}
