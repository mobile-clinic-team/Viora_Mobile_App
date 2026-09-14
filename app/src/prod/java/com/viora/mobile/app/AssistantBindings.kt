package com.viora.mobile.app

import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.time.AppClock
import com.viora.mobile.feature.assistant.domain.*
import kotlinx.coroutines.CoroutineScope

@Suppress("UNUSED_PARAMETER")
internal fun bindAssistant(session:SessionPort,clock:AppClock,contexts:AssistantContextReader,scope:CoroutineScope)=
    AssistantDependencies(UnavailableAssistant,UnavailableAssistant,UnavailableAssistant)
