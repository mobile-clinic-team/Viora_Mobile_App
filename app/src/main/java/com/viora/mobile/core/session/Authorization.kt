package com.viora.mobile.core.session

/** Typed interpretation of the existing backend membership role. Unknown roles fail closed. */
enum class AppRole(val label: String) {
    PATIENT("Patient"), DOCTOR("Doctor"), NURSE("Nurse"), RECEPTIONIST("Receptionist"), ADMIN("Administrator");
    companion object { fun parse(value: String?): AppRole? = entries.firstOrNull { it.name == value } }
}

/** Wire roles are canonical; the legacy ADMIN spelling is synthetic only. */
fun serverRole(value: String): AppRole = when (value) {
    "PATIENT" -> AppRole.PATIENT
    "DOCTOR" -> AppRole.DOCTOR
    "NURSE" -> AppRole.NURSE
    "RECEPTIONIST" -> AppRole.RECEPTIONIST
    "CLINIC_ADMIN" -> AppRole.ADMIN
    else -> error("Unknown server authority")
}

object Authorization {
    private val nursePermissions = setOf("patient.read", "doctor.read", "appointment.read", "encounter.read", "record.read")
    private val adminPermissions = setOf("admin.users.read", "admin.workspaces.read", "admin.roles.read", "admin.audit.read")
    fun permits(role: AppRole?, permission: String): Boolean = when (role) {
        AppRole.PATIENT -> permission == "patient.self"
        AppRole.DOCTOR -> permission in WorkspaceContext.CLINICAL_PERMISSIONS
        AppRole.NURSE -> permission in nursePermissions
        AppRole.ADMIN -> permission in adminPermissions
        AppRole.RECEPTIONIST -> false
        null -> false
    }
    fun canEnter(state: SessionState, role: AppRole): Boolean = state.phase == SessionPhase.READY &&
        state.user != null && state.selectedRole == role && ((role == AppRole.PATIENT && state.serverAuthority &&
            state.workspace == null && state.memberships.isEmpty()) || (role in state.roles &&
        state.workspace?.let { context -> AppRole.parse(context.role) == role && state.memberships.any {
            it.active && it.userId == state.user.id && it.id == context.membershipId &&
                it.workspaceId == context.id && AppRole.parse(it.role) == role
        } } == true))
}

/** Environment-provided account fixtures; the UI only submits credentials to authentication. */
class DemoAccount(val label: String, val email: String, val password: String)
interface LocalCredentialGateway {
    val demoAccounts: List<DemoAccount>
    suspend fun authenticate(email: String, password: String): TokenBundle
}
