package com.viora.mobile.app

import com.viora.mobile.core.session.*
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.clinical.domain.ClinicalReadRepository
import kotlinx.coroutines.CoroutineScope

@Suppress("UNUSED_PARAMETER")
internal fun bindAssistant(session: SessionPort, clock: AppClock, contexts: AssistantContextReader, scope: CoroutineScope,
    requests: AuthenticatedRequestPort, reads: ClinicalReadRepository) = bindLiveAssistant(session, requests, reads, clock, scope)
