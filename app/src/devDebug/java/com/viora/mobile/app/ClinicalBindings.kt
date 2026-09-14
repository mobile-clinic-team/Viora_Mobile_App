package com.viora.mobile.app

import com.viora.mobile.core.session.AuthenticatedRequestPort
import com.viora.mobile.core.session.SessionPort
import com.viora.mobile.feature.clinical.data.SyntheticClinicalReadRepository
import com.viora.mobile.feature.clinical.domain.ClinicalReadRepository

@Suppress("UNUSED_PARAMETER")
internal fun bindClinicalReads(session: SessionPort, requests: AuthenticatedRequestPort): ClinicalReadRepository = SyntheticClinicalReadRepository(session)
