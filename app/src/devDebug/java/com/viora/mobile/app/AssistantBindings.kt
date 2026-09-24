package com.viora.mobile.app

import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.domain.*
import com.viora.mobile.feature.assistant.data.SyntheticAssistantBackend
import kotlinx.coroutines.CoroutineScope

internal fun bindAssistant(session:SessionPort,clock:AppClock,contexts:AssistantContextReader,scope:CoroutineScope, requests:com.viora.mobile.core.session.AuthenticatedRequestPort, reads:com.viora.mobile.feature.clinical.domain.ClinicalReadRepository):AssistantDependencies {
    val backend=SyntheticAssistantBackend(session,clock,contexts,scope)
    return AssistantDependencies(backend,backend,backend)
}

