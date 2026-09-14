package com.viora.mobile.app

import com.viora.mobile.core.time.AppClock
import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.core.session.UnavailableGateway

@Suppress("UNUSED_PARAMETER")
class EnvironmentBindings(clock: AppClock) : OperationalEnvironmentBindings {
    override val synthetic = false
    val auth = UnavailableGateway()
    val workspaces = auth
    override fun operational(session: SessionPort, requests: AuthenticatedRequestPort, clock: AppClock) =
        OperationalDependencies(UnavailableOperationalRepositories, UnavailableOperationalRepositories,
            UnavailableOperationalRepositories, com.viora.mobile.feature.appointments.domain.SchedulingCapability.Unavailable, { emptyList() })
}
