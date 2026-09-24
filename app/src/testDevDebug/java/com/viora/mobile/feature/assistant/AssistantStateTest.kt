package com.viora.mobile.feature.assistant

import androidx.lifecycle.ViewModelStore
import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.assistant.data.SyntheticGeneration
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.assistant.ui.*
import com.viora.mobile.feature.clinical.domain.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AssistantStateTest {
    private fun scenario(block:suspend TestScope.(AssistantFixture,AssistantViewModel)->Unit)=runTest {
        Dispatchers.setMain(StandardTestDispatcher(testScheduler)); val owner=ViewModelStore()
        try { val f=AssistantFixture(backgroundScope); f.login(); runCurrent(); block(f,f.model(owner)) }
        finally { owner.clear(); Dispatchers.resetMain() }
    }
    @Test fun loadingEmptyFailureRetryAndSuccessAreDistinct()=scenario { f,m ->
        m.home(); assertEquals("LOADING",m.state.value.phase); runCurrent(); assertEquals("EMPTY",m.state.value.phase)
        f.backend.nextReadFailure=ApiResult.Failure("TRANSPORT_ERROR"); m.home(); runCurrent(); assertEquals("ERROR",m.state.value.phase)
        m.retry(); runCurrent(); assertEquals("EMPTY",m.state.value.phase)
        val op=f.ops.prepare(); f.backend.create(AssistantContext("GENERAL"),op); f.ops.acknowledgeResolved(op.operationId)
        m.home(); runCurrent(); assertEquals("READY",m.state.value.phase); assertEquals(1,m.state.value.conversations.size)
    }
    @Test fun explicitContextAndCreationRequireReceiptAcknowledgment()=scenario { _,m ->
        m.context(AssistantContext("GENERAL")); runCurrent(); assertNull(m.state.value.conversation)
        m.createConversation(); m.createConversation(); runCurrent()
        assertEquals("SAVED",m.state.value.phase); assertNotNull(m.state.value.pending)
        m.acknowledge(); runCurrent(); assertNull(m.state.value.pending); assertEquals("READY",m.state.value.phase)
    }
    @Test fun draftReviewAndStepUpNeverAutoApprove()=scenario { f,m ->
        val d=f.generated(); m.openDraft(d.id); runCurrent(); m.approve(); runCurrent(); assertEquals(0,f.backend.handoffCalls)
        m.review(); runCurrent(); assertEquals("IN_REVIEW",m.state.value.draft!!.status)
        m.acknowledge(); runCurrent(); m.requestAssurance(); runCurrent()
        assertTrue(m.state.value.confirmation); assertEquals(0,f.backend.handoffCalls)
        m.cancelConfirmation(); m.approve(); runCurrent(); assertEquals(0,f.backend.handoffCalls)
    }
    @Test fun explicitApprovalVerifiesEvidenceAndPreventsDuplicateTaps()=scenario { f,m ->
        val d=f.reviewed(); m.openDraft(d.id); runCurrent(); m.requestAssurance(); runCurrent(); m.approve(); m.approve(); runCurrent()
        assertEquals("HANDOFF",m.state.value.phase); assertNotNull(m.state.value.evidence); assertEquals(1,f.backend.handoffCalls)
        assertEquals("7",f.target().currentVersion); m.acknowledge(); runCurrent(); m.approve(); runCurrent(); assertEquals(1,f.backend.handoffCalls)
    }
    @Test fun changedTargetInvalidatesApproval()=scenario { f,m ->
        val d=f.reviewed(); m.openDraft(d.id); runCurrent(); m.requestAssurance(); runCurrent(); f.changeTarget(); m.approve(); runCurrent()
        assertEquals("STALE",m.state.value.phase); assertFalse(m.state.value.confirmation); assertEquals(0,f.backend.handoffCalls)
    }
    @Test fun expiredDraftClearsContentAndDisablesReview()=scenario { f,m ->
        val d=f.generated(); f.backend.expireDraft(d.id); m.openDraft(d.id); runCurrent()
        assertEquals("EXPIRED",m.state.value.phase); assertNull(m.state.value.draft); m.review(); runCurrent(); assertEquals(0,f.backend.handoffCalls)
    }
    @Test fun editInvalidatesPreviousConfirmationAndNeedsFreshReviewOfEditedVersion()=scenario { f,m ->
        val d=f.reviewed(); m.openDraft(d.id); runCurrent(); m.requestAssurance(); runCurrent()
        m.edit(ClinicalContent("Synthetic reviewed edit","","","")); assertFalse(m.state.value.confirmation)
        m.approve(); runCurrent(); assertEquals(0,f.backend.handoffCalls)
        m.saveEdit(); runCurrent(); assertNotEquals(d.versionToken,m.state.value.draft!!.versionToken)
        assertEquals("Synthetic reviewed edit",m.state.value.draft!!.content.diagnosis)
    }
    @Test fun timeoutResolvesFailureButUnknownCannotCreateAnotherIntent()=scenario { f,m ->
        m.context(f.context); runCurrent(); f.backend.generation=SyntheticGeneration.TIMEOUT; m.generate(); runCurrent()
        assertEquals("RESOLVED_FAILURE",m.state.value.phase); assertNull(m.state.value.pending)
        f.backend.generation=SyntheticGeneration.UNKNOWN; m.generate(); runCurrent(); assertEquals("UNKNOWN",m.state.value.phase)
        m.generate(); runCurrent(); assertEquals(2,f.backend.generationCalls); assertNotNull(m.state.value.pending)
    }
    @Test fun storageFailurePreventsGenerationDispatch()=scenario { f,m ->
        m.context(f.context); runCurrent(); f.store.rejectWrites=true; m.generate(); runCurrent()
        assertEquals(0,f.backend.generationCalls); assertEquals("ERROR",m.state.value.phase)
    }
    @Test fun stopWaitingPreservesOperationForRecovery()=scenario { f,m ->
        m.context(f.context); runCurrent(); val gate=CompletableDeferred<Unit>(); f.backend.beforeGeneration={gate.await()}
        m.generate(); runCurrent(); assertTrue(m.state.value.busy); m.stopWaiting(); runCurrent()
        assertEquals("UNKNOWN",m.state.value.phase); assertNotNull(m.state.value.pending)
        m.closeUnknown(); runCurrent(); assertEquals("UNKNOWN",m.state.value.phase); assertEquals(1,f.backend.generationCalls)
    }
    @Test fun workspaceSwitchClearsInputAndRejectsLateRead()=scenario { f,m ->
        val gate=CompletableDeferred<Unit>(); f.backend.beforeRead={withContext(NonCancellable){gate.await()}}
        m.home(); runCurrent(); f.session.chooseWorkspace(); runCurrent(); gate.complete(Unit); runCurrent()
        assertEquals("CLEARED",m.state.value.phase); assertTrue(m.state.value.conversations.isEmpty()); m.retry(); runCurrent(); assertEquals("CLEARED",m.state.value.phase)
    }
    @Test fun logoutClearsDraftAndPrivateInput()=scenario { f,m ->
        val d=f.reviewed(); m.openDraft(d.id); runCurrent(); m.edit(d.content); f.session.logout(); runCurrent()
        assertEquals("CLEARED",m.state.value.phase); assertNull(m.state.value.draft); assertNull(m.state.value.edit); assertFalse(m.state.value.toString().contains(d.content.clinicalNotes))
    }
    @Test fun permissionDenialAndFailedHandoffNeverShowSuccess()=scenario { f,m ->
        val d=f.reviewed(); m.openDraft(d.id); runCurrent(); m.requestAssurance(); runCurrent()
        f.backend.nextHandoffFailure=ApiResult.Failure("FORBIDDEN",403); m.approve(); runCurrent()
        assertEquals("RESOLVED_FAILURE",m.state.value.phase); assertNull(m.state.value.evidence)
    }
    @Test fun malformedRouteContainsNoSensitivePayloadAndDoesNotOpenContext()=scenario { _,m ->
        m.openConversation("not-an-id"); runCurrent(); assertEquals("ERROR",m.state.value.phase)
        val fields=AssistantDraftRoute::class.java.declaredFields.filterNot { it.isSynthetic || java.lang.reflect.Modifier.isStatic(it.modifiers) }.map { it.name }
        assertEquals(listOf("id"),fields)
    }
}
