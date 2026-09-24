package com.viora.mobile.app

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.data.HttpAssistantRepository
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.data.handoff.HttpClinicalHandoff
import com.viora.mobile.feature.clinical.domain.ClinicalReadRepository
import kotlinx.coroutines.CoroutineScope

/** Provider configuration is injected through the existing identity seam, never a second login system. */
internal fun bindLiveAssistant(session: SessionPort, requests: AuthenticatedRequestPort, reads: ClinicalReadRepository,
    clock: AppClock, scope: CoroutineScope, environment: AuthEnvironment? = null, browser: StepUpBrowser? = null): AssistantDependencies {
    val repository = HttpAssistantRepository(requests, session)
    val configured = ProductionAssuranceHandoff.create(environment, browser, requests, session, repository, reads, clock, scope)
    return if (configured is ApiResult.Success) AssistantDependencies(repository, configured.value.assurance, configured.value.handoff)
    else AssistantDependencies(repository, AssistantAssurancePort { _, _ -> ApiResult.Failure("ASSURANCE_PROVIDER_NOT_CONFIGURED", 503) },
        HttpClinicalHandoff(requests, session, null, reads, clock))
}
