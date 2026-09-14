package com.viora.mobile.feature.assistant

import com.viora.mobile.core.model.*
import com.viora.mobile.core.session.AssuranceBinding
import com.viora.mobile.feature.assistant.data.SyntheticGeneration
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.domain.*
import com.viora.mobile.testutil.*
import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AssistantContractTest {
    @Test fun conversationCreationIsExplicitAndContextImmutable()=runTest {
        val f=AssistantFixture(backgroundScope); f.login()
        assertTrue((f.backend.conversations() as ApiResult.Success).value.items.isEmpty())
        val op=f.ops.prepare(); val receipt=(f.backend.create(f.context,op) as ApiResult.Success).value
        val conversation=(f.backend.conversation(receipt.resourceId) as ApiResult.Success).value
        assertTrue(conversation.context.same(f.context)); assertEquals(USER,conversation.ownerUserId)
        assertEquals(1,(f.backend.conversations() as ApiResult.Success).value.items.size)
    }
    @Test fun messagesExposeOnlyCompletePublicRoles()=runTest {
        val f=AssistantFixture(backgroundScope); f.login()
        val c=(f.backend.create(AssistantContext("GENERAL"),f.ops.prepare()) as ApiResult.Success).value
        val op=f.ops.prepare(); f.backend.send(c.resourceId,"Synthetic question",op)
        val messages=(f.backend.messages(c.resourceId) as ApiResult.Success).value.items
        assertEquals(listOf("USER","ASSISTANT"),messages.map { it.role }); assertTrue(messages.all { it.requestOperationId==op.operationId })
        assertThrows(IllegalArgumentException::class.java) { Message(Ids.newId(),c.resourceId,"SYSTEM","hidden",f.clock.now(),op.operationId,emptyList()) }
        assertThrows(IllegalArgumentException::class.java) { Message(Ids.newId(),c.resourceId,"TOOL","hidden",f.clock.now(),op.operationId,emptyList()) }
    }
    @Test fun contextRelationshipsAndWorkspaceAreChecked()=runTest {
        val f=AssistantFixture(backgroundScope); f.login()
        assertTrue(f.contexts.validate(f.context) is ApiResult.Success)
        val wrong=AssistantContext("ENCOUNTER",com.viora.mobile.feature.clinical.data.SyntheticClinicalData.PATIENT_A,com.viora.mobile.feature.clinical.data.SyntheticClinicalData.ENCOUNTER_B)
        assertFalse(f.contexts.validate(wrong) is ApiResult.Success)
        f.session.selectWorkspace(B); assertEquals(403,(f.backend.conversations() as ApiResult.Failure).status)
    }
    @Test fun draftPreservesTargetVersionContentAndAuthorizedProvenance()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val target=f.target(); val d=f.generated()
        assertEquals("GENERATED",d.status); assertTrue(d.matches(target)); assertEquals(target.current.id,d.provenance.single().sourceId)
        assertEquals(target.currentVersion,d.provenance.single().sourceVersion); assertNotNull(d.versionToken)
        assertTrue(d.expiresAt>d.createdAt); assertNull(d.approvedBy)
        assertEquals(d.id,(f.backend.drafts(target.id) as ApiResult.Success).value.items.single().id)
    }
    @Test fun generationFailureTimeoutAndRejectionPublishNoDraft()=runTest {
        for(mode in listOf(SyntheticGeneration.FAILURE,SyntheticGeneration.TIMEOUT,SyntheticGeneration.REJECTED)) {
            val f=AssistantFixture(backgroundScope); f.login(); f.backend.generation=mode; val op=f.ops.prepare()
            assertTrue(f.backend.generate(f.target().reference(),null,op) is ApiResult.Failure)
            assertEquals("FAILED",(f.backend.outcome(op) as ApiResult.Success).value.state)
            assertTrue((f.backend.drafts(f.target().id) as ApiResult.Success).value.items.isEmpty())
        }
    }
    @Test fun lostGenerationResponseRecoversWithoutRedispatch()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); f.backend.generation=SyntheticGeneration.LOST_RESPONSE; val op=f.ops.prepare()
        assertEquals(ApiResult.OutcomeUnknown,f.backend.generate(f.target().reference(),null,op))
        val receipt=(f.backend.outcome(op) as ApiResult.Success).value.receipt!!
        assertTrue(f.backend.draft(receipt.resourceId) is ApiResult.Success); assertEquals(1,f.backend.generationCalls)
        assertTrue(f.backend.generate(f.target().reference(),null,op) is ApiResult.Failure); assertEquals(1,f.backend.generationCalls)
    }
    @Test fun cancelledTransportRemainsProcessingAndCannotBeClosedAsFailure()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val gate=CompletableDeferred<Unit>(); f.backend.beforeGeneration={gate.await()}
        val target=f.target(); val op=f.ops.prepare(); val job=launch { f.backend.generate(target.reference(),null,op) }; runCurrent(); job.cancelAndJoin()
        assertEquals("PROCESSING",(f.backend.outcome(op) as ApiResult.Success).value.state)
        assertEquals("PROCESSING",(f.backend.close(op) as ApiResult.Success).value.state)
    }
    @Test fun unknownAndNotAdmittedAreDifferentOutcomes()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); f.backend.generation=SyntheticGeneration.UNKNOWN; val op=f.ops.prepare()
        assertEquals(ApiResult.OutcomeUnknown,f.backend.generate(f.target().reference(),null,op))
        assertEquals("PROCESSING",(f.backend.close(op) as ApiResult.Success).value.state)
        val absent=f.ops.prepare(); assertEquals("OPERATION_NOT_FOUND",(f.backend.outcome(absent) as ApiResult.Failure).code)
        assertEquals("CLOSED",(f.backend.close(absent) as ApiResult.Success).value.state)
    }
    @Test fun reviewEditAndRejectRequireCorrectStateAndCurrentVersion()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val d=f.generated()
        assertEquals("INVALID_STATE",(f.backend.reject(d,null,f.ops.prepare()) as ApiResult.Failure).code)
        f.backend.review(d,f.ops.prepare()); val review=(f.backend.draft(d.id) as ApiResult.Success).value
        assertEquals(USER,review.reviewedBy); assertNotEquals(d.versionToken,review.versionToken)
        assertEquals("VERSION_CONFLICT",(f.backend.edit(d,d.content,f.ops.prepare()) as ApiResult.Failure).code)
        f.backend.reject(review,null,f.ops.prepare()); assertEquals("REJECTED",(f.backend.draft(d.id) as ApiResult.Success).value.status)
    }
    @Test fun expiredDraftCannotBeReadOrApproved()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val d=f.reviewed(); f.backend.expireDraft(d.id)
        assertEquals(410,(f.backend.draft(d.id) as ApiResult.Failure).status)
        val binding=AssuranceBinding("draft.approve",A,d.id,d.versionToken,d.targetVersionToken)
        assertTrue(f.backend.request(binding,f.session.snapshot()!!) is ApiResult.Failure)
    }
    @Test fun generatedDraftCannotAcquireApprovalAssurance()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val d=f.generated()
        assertEquals(403,(f.backend.request(AssuranceBinding("draft.approve",A,d.id,d.versionToken,d.targetVersionToken),f.session.snapshot()!!) as ApiResult.Failure).status)
    }
    @Test fun handoffEvidenceIsExactAndClinicalRepositoryIsUnchanged()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val d=f.reviewed(); val target=f.target(); val snapshot=f.session.snapshot()!!
        val grant=(f.backend.request(AssuranceBinding("draft.approve",A,d.id,d.versionToken,d.targetVersionToken),snapshot) as ApiResult.Success).value
        val op=f.ops.prepare(); val request=ClinicalHandoffRequest(d.id,d.versionToken,target.reference(),grant,op,snapshot)
        val evidence=(f.backend.request(request) as ApiResult.Success).value
        val result=(f.backend.readCommitted(evidence) as ApiResult.Success).value
        assertEquals(op.operationId,evidence.operationId); assertEquals("8",evidence.recordVersion); assertEquals("DRAFT",result.status)
        assertEquals(d.id,result.current.sourceDraftId); assertEquals("AI_HANDOFF",result.current.kind); assertNull(result.reviewedVersion)
        assertTrue(sameContent(d.content,result.current.content)); assertEquals("7",f.target().currentVersion)
        assertTrue(f.backend.request(request) is ApiResult.Failure)
        assertEquals("APPROVED",(f.backend.draft(d.id) as ApiResult.Success).value.status)
    }
    @Test fun changedTargetFailsHandoffWithoutPartialApproval()=runTest {
        val f=AssistantFixture(backgroundScope); f.login(); val d=f.reviewed(); val target=f.target(); val snapshot=f.session.snapshot()!!
        val grant=(f.backend.request(AssuranceBinding("draft.approve",A,d.id,d.versionToken,d.targetVersionToken),snapshot) as ApiResult.Success).value
        f.changeTarget()
        val result=f.backend.request(ClinicalHandoffRequest(d.id,d.versionToken,target.reference(),grant,f.ops.prepare(),snapshot))
        assertEquals(412,(result as ApiResult.Failure).status); assertEquals("IN_REVIEW",(f.backend.draft(d.id) as ApiResult.Success).value.status)
    }
    @Test fun domainRejectsInvalidContextAndRedactsContent()=runTest {
        assertThrows(IllegalArgumentException::class.java) { AssistantContext("GENERAL",USER) }
        assertThrows(IllegalArgumentException::class.java) { AssistantContext("ENCOUNTER",USER) }
        val f=AssistantFixture(backgroundScope); f.login(); val d=f.generated()
        assertFalse(d.toString().contains(d.content.clinicalNotes)); assertEquals("AiDraft(REDACTED)",d.toString())
        assertThrows(IllegalArgumentException::class.java) { Provenance(USER,"URL",A,"1","Synthetic",null) }
    }
}
