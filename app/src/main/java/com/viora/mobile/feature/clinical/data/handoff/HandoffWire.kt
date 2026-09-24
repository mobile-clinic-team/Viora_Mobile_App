package com.viora.mobile.feature.clinical.data.handoff

import com.viora.mobile.core.model.Ids
import com.viora.mobile.core.model.VersionToken
import com.viora.mobile.core.network.ApiPayload
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.clinical.domain.HandoffEvidence
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*

/** Payload-free, server-issued operation result. Never treat a reference as current clinical content. */
class HandoffOperationStatus(val operationId: String, val state: String, val receipt: HandoffWriteReceipt?, val errorCode: String?,
    val createdAt: String, val expiresAt: String?) {
    override fun toString() = "HandoffOperationStatus(REDACTED)"
}
class HandoffWriteReceipt(val draftId: String, val evidence: HandoffEvidence, val resultingDraftVersionToken: String) {
    override fun toString() = "HandoffWriteReceipt(REDACTED)"
}
class HandoffOperationPage(val items: List<HandoffOperationStatus>, val nextCursor: String?) {
    override fun toString() = "HandoffOperationPage(REDACTED)"
}

internal object HandoffWire {
    private val json = Json { ignoreUnknownKeys = true }
    fun receipt(payload: ApiPayload, operation: OperationReceipt): HandoffWriteReceipt {
        require(payload.status == 200)
        val dto = json.decodeFromJsonElement<Receipt>(data(payload))
        val result = requireNotNull(dto.validated(operation.operationId))
        require(payload.etag == result.resultingDraftVersionToken)
        return result
    }
    fun status(payload: ApiPayload, operation: OperationReceipt): HandoffOperationStatus {
        require(payload.status == 200)
        val dto = json.decodeFromJsonElement<Status>(data(payload))
        require(dto.operationId == operation.operationId)
        return dto.validated()
    }
    fun page(payload: ApiPayload): HandoffOperationPage {
        require(payload.status == 200)
        val dto = json.decodeFromString<Page>(payload.json)
        require(dto.data.size <= 100 && dto.data.map { it.operationId }.distinct().size == dto.data.size)
        require(dto.page.hasMore == (dto.page.nextCursor != null))
        dto.page.nextCursor?.let { require(it.isNotBlank() && it.length <= 2048 && it.none(Char::isISOControl)) }
        return HandoffOperationPage(dto.data.map { it.validated() }, dto.page.nextCursor)
    }
    private fun data(payload: ApiPayload) = json.parseToJsonElement(payload.json).jsonObject.getValue("data")

    @Serializable private class Ref(val type: String, val id: String, val parentId: String?, val versionToken: String?) {
        fun validate() {
            require(Ids.valid(id))
            require(type in setOf("PATIENT", "APPOINTMENT", "ENCOUNTER", "RECORD", "RECORD_VERSION", "CONVERSATION", "MESSAGE", "AI_DRAFT"))
            if (type in setOf("RECORD_VERSION", "MESSAGE")) require(parentId?.let(Ids::valid) == true) else require(parentId == null)
            if (type in setOf("RECORD_VERSION", "MESSAGE", "CONVERSATION")) require(versionToken == null)
            else require(versionToken?.let(VersionToken::valid) == true)
        }
    }
    @Serializable private class Evidence(val operationId: String, val recordId: String, val recordVersionId: String,
        val recordVersion: String, val recordVersionToken: String, val approvedDraftVersionToken: String,
        val auditEventId: String, val committedAt: String) {
        fun model() = HandoffEvidence(operationId, recordId, recordVersionId, recordVersion, recordVersionToken,
            approvedDraftVersionToken, auditEventId, WireTime.parse(committedAt))
    }
    @Serializable private class Receipt(val operationId: String, val state: String, val primary: Ref, val related: List<Ref>,
        val handoff: Evidence?, val committedAt: String, val expiresAt: String) {
        fun validated(expectedId: String): HandoffWriteReceipt? {
            require(Ids.valid(operationId) && operationId == expectedId && state == "SUCCEEDED")
            require(WireTime.parse(expiresAt) == WireTime.parse(committedAt).plusSeconds(86400))
            primary.validate(); require(related.size <= 100); related.forEach { it.validate() }
            require(related.map { it.type to it.id }.distinct().size == related.size)
            val evidence = handoff?.model() ?: return null
            require(primary.type == "AI_DRAFT" && primary.versionToken != evidence.approvedDraftVersionToken)
            require(evidence.operationId == operationId && evidence.committedAt == WireTime.parse(committedAt))
            require(related.size == 2)
            val record = related.single { it.type == "RECORD" }
            val version = related.single { it.type == "RECORD_VERSION" }
            require(record.id == evidence.recordId && record.versionToken == evidence.recordVersionToken)
            require(version.id == evidence.recordVersionId && version.parentId == evidence.recordId)
            return HandoffWriteReceipt(primary.id, evidence, requireNotNull(primary.versionToken))
        }
    }
    @Serializable private class Status(val operationId: String, val state: String, val result: Receipt?, val errorCode: String?,
        val createdAt: String, val expiresAt: String?) {
        fun validated(): HandoffOperationStatus {
            require(Ids.valid(operationId)); val created = WireTime.parse(createdAt)
            require(state in setOf("PROCESSING", "INDETERMINATE", "SUCCEEDED", "FAILED", "CLOSED"))
            val terminal = state in setOf("SUCCEEDED", "FAILED", "CLOSED")
            require(terminal == (expiresAt != null))
            expiresAt?.let { require(WireTime.parse(it) > created) }
            require((state == "SUCCEEDED") == (result != null))
            if (state == "FAILED") require(errorCode?.matches(Regex("[A-Z_]{1,64}")) == true)
            else if (state == "CLOSED") require(errorCode == "OPERATION_CLOSED") else require(errorCode == null)
            val receipt = result?.validated(operationId)
            if (result != null) require(expiresAt == result.expiresAt)
            return HandoffOperationStatus(operationId, state, receipt, errorCode, createdAt, expiresAt)
        }
    }
    @Serializable private class Page(val data: List<Status>, val page: PageInfo)
    @Serializable private class PageInfo(val nextCursor: String?, val hasMore: Boolean)
}

