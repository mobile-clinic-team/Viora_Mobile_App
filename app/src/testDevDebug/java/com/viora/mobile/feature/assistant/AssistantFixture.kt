package com.viora.mobile.feature.assistant

import androidx.lifecycle.ViewModelStore
import com.viora.mobile.app.EnvironmentBindings
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.operations.OperationCoordinator
import com.viora.mobile.core.session.LocalCredentialGateway
import com.viora.mobile.core.session.SessionCoordinator
import com.viora.mobile.feature.assistant.data.SyntheticAssistantBackend
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.assistant.ui.AssistantViewModel
import com.viora.mobile.feature.clinical.data.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers

internal class AssistantFixture(scope:CoroutineScope) {
    val clock=FakeClock(); val store=FakeSecureStore(); val bindings=EnvironmentBindings(clock)
    // Keep the session expiry timer on a real dispatcher; runTest may fast-forward virtual time
    // while a MockWebServer call is suspended, which would expire this 12-hour fixture session.
    private val lifecycleScope = CoroutineScope(scope.coroutineContext + Dispatchers.Default)
    val session=SessionCoordinator(bindings.auth,bindings.workspaces,store,clock,lifecycleScope)
    val ops=OperationCoordinator(session,store,clock)
    val operational=bindings.operational(session,FakeAuthenticatedRequestExecutor(),clock)
    val clinical=SyntheticClinicalReadRepository(session)
    var recordOverride: ClinicalRecord?=null
    val reads=object:ClinicalReadRepository by clinical {
        override suspend fun record(id:String):ApiResult<ClinicalRecord> = recordOverride?.let { ApiResult.Success(it) } ?: clinical.record(id)
    }
    val contexts=AssistantContextReader(operational.patients,reads,session)
    val backend=SyntheticAssistantBackend(session,clock,contexts,scope)
    val context=AssistantContext("ENCOUNTER",SyntheticClinicalData.PATIENT_A,SyntheticClinicalData.ENCOUNTER)
    private val demoDoctor = (bindings.auth as LocalCredentialGateway).demoAccounts.single { it.email == "doctor@viora.demo" }
    suspend fun login() { session.restore(); session.signIn(demoDoctor.email, demoDoctor.password); session.selectWorkspace(A) }
    suspend fun target()=(contexts.validate(context) as ApiResult.Success).value!!
    suspend fun generated():AiDraft {
        val op=ops.prepare(); val result=backend.generate(target().reference(),null,op) as ApiResult.Success
        ops.acknowledgeResolved(op.operationId)
        return (backend.draft(result.value.resourceId) as ApiResult.Success).value
    }
    suspend fun reviewed():AiDraft {
        val draft=generated(); val op=ops.prepare(); backend.review(draft,op); ops.acknowledgeResolved(op.operationId)
        return (backend.draft(draft.id) as ApiResult.Success).value
    }
    fun model(owner:ViewModelStore)=AssistantViewModel(backend,contexts,backend,backend,session,ops,clock).also { owner.put("assistant",it) }
    fun changeTarget() {
        val r=SyntheticClinicalData.records.first()
        recordOverride=ClinicalRecord(r.id,r.workspaceId,"\"changed\"",r.allowedActions,r.createdAt,r.updatedAt,r.encounterId,r.patientId,r.status,r.currentVersion,r.current,r.reviewedVersion)
    }
}
