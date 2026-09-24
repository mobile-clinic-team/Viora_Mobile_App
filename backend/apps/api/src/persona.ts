import type { TransactionalDatabase } from '../../../libs/platform/database/src/index.ts';
import type { AuthenticatedSessionIdentity } from './auth-composition.ts';
import { effectiveGrants } from './authorization-policy.ts';

const staff = new Set(['DOCTOR','NURSE','RECEPTIONIST','CLINIC_ADMIN']);
export function createPersonaResolver(db:TransactionalDatabase) {
  return async(identity:AuthenticatedSessionIdentity,workspaceId?:string)=>db.transaction(async tx=>{
    const user=(await tx.query(`SELECT u.id,u.email,u.display_name FROM users u JOIN sessions s ON s.user_id=u.id
      WHERE u.id=$1 AND u.status='ACTIVE' AND s.id=$2 AND s.status='ACTIVE'
      AND s.expires_at>clock_timestamp() AND s.access_expires_at>clock_timestamp() FOR SHARE OF u,s`,[identity.userId,identity.sessionId])).rows[0];
    if(!user) throw new Error('UNAUTHENTICATED');
    const rows=(await tx.query(`SELECT m.id,m.user_id,m.tenant_id,m.role,m.status,m.permission_revision,t.name,t.status AS tenant_status
      FROM memberships m JOIN tenants t ON t.id=m.tenant_id WHERE m.user_id=$1 FOR SHARE OF m,t`,[identity.userId])).rows;
    // Never disguise unclassified authority, or a disabled workspace, as a Patient.
    if(rows.some(row=>!staff.has(String(row.role)) || !['ACTIVE','SUSPENDED','REVOKED'].includes(String(row.status)))) throw new Error('INVALID_AUTHORITY');
    const active=rows.filter(row=>row.status==='ACTIVE');
    if(active.some(row=>row.tenant_status!=='ACTIVE')) throw new Error('INVALID_AUTHORITY');
    const memberships=active.map(row=>({id:String(row.id),userId:identity.userId,workspaceId:String(row.tenant_id),name:String(row.name),role:String(row.role),active:true}));
    const selected=workspaceId?active.find(row=>row.tenant_id===workspaceId):active.length===1?active[0]:undefined;
    if(workspaceId&&!selected) throw new Error('INVALID_AUTHORITY');
    let workspace=null;
    if(selected) {
      const grants=(await tx.query('SELECT permission FROM membership_grants WHERE tenant_id=$1 AND membership_id=$2',[selected.tenant_id,selected.id])).rows.map(row=>String(row.permission));
      workspace={id:String(selected.tenant_id),name:String(selected.name),timezone:'Asia/Ho_Chi_Minh',membershipId:String(selected.id),role:String(selected.role),
        permissionRevision:`"${selected.permission_revision}"`,permissions:[...effectiveGrants([String(selected.role)],grants)]};
    }
    return {user:{id:identity.userId,displayName:String(user.display_name??user.email??'Viora account'),email:user.email??null},
      sessionId:identity.sessionId,persona:active.length===0?'PATIENT':selected?String(selected.role):null,
      requiresWorkspaceSelection:active.length>1&&!selected,memberships,workspace};
  });
}
