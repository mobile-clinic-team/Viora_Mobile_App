package com.viora.mobile.feature.assistant.data

import com.viora.mobile.core.model.*
import com.viora.mobile.core.network.*
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.WireTime
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.feature.clinical.data.handoff.HandoffWire
import com.viora.mobile.feature.patients.domain.DirectoryPage
import kotlinx.coroutines.CancellationException
import kotlinx.serialization.json.*

/** Human draft commands use the canonical durable operation API. No mutation is retried here. */
class HttpAssistantRepository(private val requests: AuthenticatedRequestPort, private val session: SessionPort) : AssistantRepository {
    override suspend fun draft(id: String): ApiResult<AiDraft> {
        if (!Ids.valid(id)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return send("GET", "/v1/ai/drafts/$id", "draft.read") { payload, workspace ->
            require(payload.status == 200)
            val value = data(payload)
            require(value.string("id") == id && value.string("versionToken") == payload.etag)
            decodeDraft(value, workspace)
        }
    }
    override suspend fun drafts(targetRecordId: String): ApiResult<DirectoryPage<AiDraft>> {
        if (!Ids.valid(targetRecordId)) return ApiResult.Failure("INVALID_REQUEST", 400)
        return send("GET", "/v1/ai/drafts?targetRecordId=$targetRecordId&limit=100", "draft.read") { payload, workspace ->
            val root = Json.parseToJsonElement(payload.json).jsonObject
            val rows = root.getValue("data").jsonArray
            require(payload.status == 200 && rows.size <= 100)
            val items = rows.map { decodeDraft(it.jsonObject, workspace) }
            require(items.all { it.targetRecordId == targetRecordId } && items.map { it.id }.distinct().size == items.size)
            val page = root.getValue("page").jsonObject
            val cursor = page.optional("nextCursor")
            require(page.getValue("hasMore").jsonPrimitive.boolean == (cursor != null))
            DirectoryPage(items, cursor)
        }
    }
    override suspend fun review(draft: AiDraft, operation: OperationReceipt) = command(draft, operation, "review", "{}")
    override suspend fun reject(draft: AiDraft, reason: String?, operation: OperationReceipt) = command(draft, operation, "reject",
        buildJsonObject { put("reason", reason?.let(::JsonPrimitive) ?: JsonNull) }.toString())
    override suspend fun edit(draft: AiDraft, content: ClinicalContent, operation: OperationReceipt) = command(draft, operation, "edit",
        buildJsonObject { putJsonObject("content") {
            put("diagnosis", content.diagnosis); put("symptoms", content.symptoms)
            put("clinicalNotes", content.clinicalNotes); put("treatmentPlan", content.treatmentPlan)
        } }.toString())
    private suspend fun command(draft: AiDraft, operation: OperationReceipt, action: String, body: String): ApiResult<AssistantReceipt> =
        send(if (action == "edit") "PATCH" else "POST", "/v1/ai/drafts/${draft.id}" + if (action == "edit") "" else "/$action",
            "draft.$action", body, draft.versionToken, operation, draft.workspaceId) { payload, _ ->
            require(payload.status == 200)
            val receipt = decodeReceipt(data(payload), operation)
            require(receipt.type == "AI_DRAFT" && receipt.resourceId == draft.id)
            require(data(payload).getValue("primary").jsonObject.string("versionToken") == payload.etag)
            receipt
        }
    override suspend fun outcome(operation: OperationReceipt) = resolve(operation, false)
    override suspend fun close(operation: OperationReceipt) = resolve(operation, true)
    private suspend fun resolve(operation: OperationReceipt, close: Boolean): ApiResult<AssistantOutcome> =
        send(if (close) "POST" else "GET", "/v1/operations/${operation.operationId}" + if (close) "/close" else "",
            "draft.read", if (close) "{}" else null, operation = operation, recovery = true) { payload, _ ->
            require(payload.status == 200)
            val root = data(payload)
            require(root.string("operationId") == operation.operationId)
            val state = root.string("state")
            val result = root["result"]?.takeUnless { it is JsonNull }?.jsonObject
            require((state == "SUCCEEDED") == (result != null))
            if (result == null) AssistantOutcome(state)
            else if (result["handoff"]?.let { it !is JsonNull } == true) {
                val status = HandoffWire.status(payload, operation)
                AssistantOutcome(state, handoff = requireNotNull(status.receipt).evidence)
            } else AssistantOutcome(state, receipt = decodeReceipt(result, operation))
        }
    private suspend fun <T> send(method: String, path: String, permission: String, body: String? = null,
        version: String? = null, operation: OperationReceipt? = null, workspaceId: String? = null, recovery: Boolean = false,
        decode: (ApiPayload, String) -> T): ApiResult<T> {
        val snapshot = session.snapshot() ?: return ApiResult.StaleScope
        val workspace = snapshot.workspace ?: return ApiResult.StaleScope
        if (!workspace.allows(permission)) return ApiResult.Failure("FORBIDDEN", 403)
        if (workspaceId != null && workspaceId != workspace.id) return ApiResult.StaleScope
        if (operation != null && (operation.ownerUserId != snapshot.userId || operation.workspaceId != workspace.id)) return ApiResult.StaleScope
        return try {
            operation?.validate()
            val result = requests.execute(ApiRequest(method, path, RequestScope.WORKSPACE, body, version,
                operationId = if (recovery) null else operation?.operationId,
                operationCreatedAt = if (method == "GET") null else operation?.createdAt,
                workspaceId = workspace.id, expectedSession = snapshot))
            if (!session.matches(snapshot)) return ApiResult.StaleScope
            when (result) {
                is ApiResult.Success -> try { ApiResult.Success(decode(result.value, workspace.id)) }
                    catch (_: Exception) { if (method == "GET") ApiResult.Failure("INVALID_RESPONSE") else ApiResult.OutcomeUnknown }
                is ApiResult.Failure -> result
                ApiResult.StaleScope -> ApiResult.StaleScope
                ApiResult.OutcomeUnknown -> ApiResult.OutcomeUnknown
            }
        } catch (cancel: CancellationException) { throw cancel }
        catch (_: Exception) { if (!session.matches(snapshot)) ApiResult.StaleScope else if (method == "GET") ApiResult.Failure("TRANSPORT_ERROR") else ApiResult.OutcomeUnknown }
    }
    private fun decodeReceipt(value: JsonObject, operation: OperationReceipt): AssistantReceipt {
        require(value.string("operationId") == operation.operationId && value.string("state") == "SUCCEEDED")
        val committed = WireTime.parse(value.string("committedAt"))
        require(WireTime.parse(value.string("expiresAt")) == committed.plusSeconds(86400))
        require(value["handoff"] == null || value["handoff"] is JsonNull)
        require(value.getValue("related").jsonArray.isEmpty())
        val primary = value.getValue("primary").jsonObject
        require(primary.string("type") == "AI_DRAFT" && VersionToken.valid(primary.string("versionToken")))
        require(primary.optional("parentId") == null)
        return AssistantReceipt(operation.operationId, primary.string("id"), "AI_DRAFT")
    }
    private fun decodeDraft(value: JsonObject, workspace: String): AiDraft {
        value.optional("workspaceId")?.let { require(it == workspace) }
        val content = value.getValue("content").jsonObject
        val provenance = value.getValue("provenance").jsonArray.map { item -> item.jsonObject.let {
            Provenance(it.string("id"), it.string("kind"), it.string("sourceId"), it.string("sourceVersion"), it.string("label"), it.optional("excerpt"))
        } }
        val handoff = value["handoff"]?.takeUnless { it is JsonNull }?.jsonObject?.let {
            HandoffEvidence(it.string("operationId"), it.string("recordId"), it.string("recordVersionId"), it.string("recordVersion"),
                it.string("recordVersionToken"), it.string("approvedDraftVersionToken"), it.string("auditEventId"), WireTime.parse(it.string("committedAt")))
        }
        return AiDraft(value.string("id"), workspace, value.string("versionToken"), emptySet(), WireTime.parse(value.string("createdAt")),
            WireTime.parse(value.string("updatedAt")), value.string("patientId"), value.string("encounterId"), value.string("targetRecordId"),
            value.string("targetVersionToken"), "CLINICAL_NOTE", ClinicalContent(content.string("diagnosis"), content.string("symptoms"),
                content.string("clinicalNotes"), content.string("treatmentPlan")), provenance,
            value.string("status").let { if (it == "REVIEWING") "IN_REVIEW" else it }, value.string("createdBy"), value.optional("reviewedBy"),
            value.optional("approvedBy"), value.optional("rejectedBy"), value.optional("decidedAt")?.let(WireTime::parse),
            WireTime.parse(value.string("expiresAt")), handoff)
    }
    private fun data(payload: ApiPayload) = Json.parseToJsonElement(payload.json).jsonObject.getValue("data").jsonObject
    private fun JsonObject.string(name: String) = getValue(name).jsonPrimitive.let { require(it.isString); it.content }
    private fun JsonObject.optional(name: String) = get(name)?.takeUnless { it is JsonNull }?.jsonPrimitive?.let { require(it.isString); it.content }
    // Provider generation and conversations are outside the human review slice; never invent synthetic content.
    override suspend fun conversations(): ApiResult<DirectoryPage<Conversation>> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
    override suspend fun conversation(id: String): ApiResult<Conversation> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
    override suspend fun messages(id: String): ApiResult<DirectoryPage<Message>> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
    override suspend fun create(context: AssistantContext, operation: OperationReceipt): ApiResult<AssistantReceipt> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
    override suspend fun send(id: String, question: String, operation: OperationReceipt): ApiResult<AssistantReceipt> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
    override suspend fun generate(target: ClinicalRecordReference, instruction: String?, operation: OperationReceipt): ApiResult<AssistantReceipt> = ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
}
