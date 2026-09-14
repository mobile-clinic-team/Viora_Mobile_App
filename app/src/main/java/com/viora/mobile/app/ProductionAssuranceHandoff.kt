package com.viora.mobile.app

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.data.handoff.*
import com.viora.mobile.feature.clinical.domain.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import java.net.URI

/** Opt-in client composition. No synthetic fallback, provider secrets, or live-environment approval is supplied here. */
class ProductionAssuranceHandoff private constructor(
    val assurance: AssistantAssurancePort, val handoff: ClinicalHandoffPort, val recovery: HttpHandoffRecovery,
) {
    companion object {
        fun create(environment: AuthEnvironment?, browser: StepUpBrowser?, requests: AuthenticatedRequestPort,
            session: SessionPort, drafts: AssistantRepository, reads: ClinicalReadRepository, clock: AppClock,
            scope: CoroutineScope): ApiResult<ProductionAssuranceHandoff> {
            if (environment == null || browser == null) return ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
            if (runCatching {
                environment.validate()
                listOf(environment.issuer, environment.redirectUri, environment.authorizationEndpoint).forEach {
                    val uri = URI(it)
                    require(!uri.host.isNullOrBlank() && uri.query == null && uri.fragment == null)
                }
            }.isFailure) return ApiResult.Failure("FEATURE_UNAVAILABLE", 503)
            val controller = StepUpController(environment, HttpStepUpGateway(requests), browser, session, clock, scope)
            return ApiResult.Success(ProductionAssuranceHandoff(
                ReviewedAssistantAssurance(controller, drafts, reads, session, clock),
                HttpClinicalHandoff(requests, session, controller, reads, clock), HttpHandoffRecovery(requests, session)))
        }
    }
}

/** Refetch both immutable target binding and reviewed draft after browser return; UI must then ask again. */
internal class ReviewedAssistantAssurance(private val controller: StepUpController, private val drafts: AssistantRepository,
    private val reads: ClinicalReadRepository, private val session: SessionPort, private val clock: AppClock) : AssistantAssurancePort {
    override suspend fun request(binding: AssuranceBinding, snapshot: SessionSnapshot): ApiResult<AssuranceGrant> = try {
        val before = reviewed(binding, snapshot)
        val grant = controller.request(binding, before.targetRecordId, snapshot)
        val after = reviewed(binding, snapshot)
        require(after.targetRecordId == before.targetRecordId && sameContent(after.content, before.content))
        require(after.provenance.map { listOf(it.id, it.kind, it.sourceId, it.sourceVersion, it.label, it.excerpt) } ==
            before.provenance.map { listOf(it.id, it.kind, it.sourceId, it.sourceVersion, it.label, it.excerpt) })
        ApiResult.Success(grant)
    } catch (cancel: CancellationException) {
        controller.invalidate(); throw cancel
    } catch (_: Exception) {
        controller.invalidate(); ApiResult.Failure("ASSURANCE_REVALIDATION_REQUIRED")
    }

    private suspend fun reviewed(binding: AssuranceBinding, snapshot: SessionSnapshot): AiDraft {
        require(binding.action == "draft.approve" && snapshot.workspace?.id == binding.workspaceId)
        require(snapshot.workspace.allows("draft.approve") && snapshot.workspace.allows("record.edit"))
        val draft = (drafts.draft(binding.resourceId) as? ApiResult.Success)?.value ?: error("DRAFT_UNAVAILABLE")
        val record = (reads.record(draft.targetRecordId) as? ApiResult.Success)?.value ?: error("TARGET_UNAVAILABLE")
        require(draft.id == binding.resourceId && draft.workspaceId == binding.workspaceId && draft.status == "IN_REVIEW")
        require(draft.versionToken == binding.versionToken && draft.targetVersionToken == binding.targetVersionToken)
        require(draft.expiresAt > clock.now() && draft.matches(record))
        require(session.snapshot()?.let { sameAssuranceSession(snapshot, it) } == true && session.matches(snapshot))
        return draft
    }
}
