package com.viora.mobile.feature.assistant.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.OperationReceipt
import com.viora.mobile.core.session.*
import com.viora.mobile.feature.clinical.domain.*

class AssistantDependencies(val repository: AssistantRepository,val assurance: AssistantAssurancePort,val handoff: ClinicalHandoffPort)

/** Production stays unavailable until owner policies, backend and real step-up integration exist. */
object UnavailableAssistant : AssistantRepository, AssistantAssurancePort, ClinicalHandoffPort {
    private fun unavailable()=ApiResult.Failure("FEATURE_UNAVAILABLE",503)
    override suspend fun conversations()=unavailable()
    override suspend fun conversation(id:String)=unavailable()
    override suspend fun messages(id:String)=unavailable()
    override suspend fun create(context:AssistantContext,operation:OperationReceipt)=unavailable()
    override suspend fun send(id:String,question:String,operation:OperationReceipt)=unavailable()
    override suspend fun generate(target:ClinicalRecordReference,instruction:String?,operation:OperationReceipt)=unavailable()
    override suspend fun draft(id:String)=unavailable()
    override suspend fun drafts(targetRecordId:String)=unavailable()
    override suspend fun review(draft:AiDraft,operation:OperationReceipt)=unavailable()
    override suspend fun edit(draft:AiDraft,content:ClinicalContent,operation:OperationReceipt)=unavailable()
    override suspend fun reject(draft:AiDraft,reason:String?,operation:OperationReceipt)=unavailable()
    override suspend fun outcome(operation:OperationReceipt)=unavailable()
    override suspend fun close(operation:OperationReceipt)=unavailable()
    override suspend fun request(binding:AssuranceBinding,snapshot:SessionSnapshot)=unavailable()
    override suspend fun request(request:ClinicalHandoffRequest)=unavailable()
    override suspend fun readCommitted(evidence:HandoffEvidence)=unavailable()
}
