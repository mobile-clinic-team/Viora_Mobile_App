package com.viora.mobile.feature.clinical.domain

import com.viora.mobile.core.model.ApiResult
import com.viora.mobile.feature.patients.domain.DirectoryPage
import com.viora.mobile.feature.patients.domain.PageRequest
import com.viora.mobile.feature.patients.domain.PatientReference

/** CL02, CL06, CL14 only. Reads never create resources, review, finalize, amend or apply AI content. */
interface ClinicalReadRepository {
    suspend fun encounter(id: String): ApiResult<Encounter>
    suspend fun encounters(patient: PatientReference, page: PageRequest = PageRequest()): ApiResult<DirectoryPage<Encounter>>
    suspend fun record(id: String): ApiResult<ClinicalRecord>
}
