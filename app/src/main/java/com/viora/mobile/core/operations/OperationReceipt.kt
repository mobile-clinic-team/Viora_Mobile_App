package com.viora.mobile.core.operations

import com.viora.mobile.core.model.Ids
import kotlinx.serialization.Serializable
import java.time.Instant

@Serializable
data class OperationReceipt(
    val operationId: String,
    val ownerUserId: String,
    val workspaceId: String?,
    val createdAt: String,
    val expiresAt: String,
    val scope: String = "WORKSPACE",
) {
    fun validate() {
        require(Ids.valid(operationId) && Ids.valid(ownerUserId))
        require(if (scope == "SELF") workspaceId == null else scope == "WORKSPACE" && workspaceId?.let(Ids::valid) == true)
        require(Instant.parse(expiresAt) == Instant.parse(createdAt).plusSeconds(86400))
    }
}
