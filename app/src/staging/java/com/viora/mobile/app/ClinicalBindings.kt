package com.viora.mobile.app

import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.clinical.data.clinicalReadRepository
import com.viora.mobile.feature.clinical.domain.ClinicalReadRepository

// The existing live build guard and unavailable session gateway prevent live access.
internal fun bindClinicalReads(session: SessionPort, requests: AuthenticatedRequestPort): ClinicalReadRepository = clinicalReadRepository(requests, session)
