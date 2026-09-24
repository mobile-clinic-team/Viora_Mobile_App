/** Classified ceilings; mutation resource/field checks live in command policy. */
const ceilings: Readonly<Record<string, readonly string[]>> = {
  CLINIC_ADMIN: ['patient.read', 'patient.create', 'patient.update'],
  DOCTOR: ['patient.read', 'patient.create', 'patient.update', 'encounter.read', 'record.read',
    'record.edit', 'draft.read', 'draft.review', 'draft.edit', 'draft.reject', 'draft.approve'],
  NURSE: ['patient.read', 'patient.create', 'patient.update', 'encounter.read', 'record.read'],
  RECEPTIONIST: ['patient.read'],
};

export function withinRoleCeiling(roles: readonly string[], permission: string): boolean {
  return roles.some(role => Object.hasOwn(ceilings, role) && ceilings[role].includes(permission));
}

export function effectiveGrants(roles: readonly string[], grants: Iterable<string>): ReadonlySet<string> {
  return new Set([...grants].filter(grant => withinRoleCeiling(roles, grant)));
}
