import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PASSWORD_ISSUER, type PasswordCredentialStore } from '../../domain/src/password-credentials.ts';
import type { SessionService } from './session-service.ts';

export class PasswordAuthError extends Error {
  readonly code: 'VALIDATION_ERROR'|'DUPLICATE_IDENTITY'|'INVALID_CREDENTIALS'|'AUTH_BUSY';
  constructor(code: PasswordAuthError['code']) { super(code); this.code = code; }
}
function input(body: unknown, registration: boolean) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new PasswordAuthError('VALIDATION_ERROR');
  const value = body as Record<string,unknown>;
  const keys = registration ? ['email','password','displayName'] : ['email','password'];
  if (Object.keys(value).length !== keys.length || Object.keys(value).some(key=>!keys.includes(key)) ||
    typeof value.email !== 'string' || typeof value.password !== 'string') throw new PasswordAuthError('VALIDATION_ERROR');
  const email=value.email.trim().toLowerCase(), password=value.password;
  if (email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length<12 || Buffer.byteLength(password)>256 || password.includes('\0')) throw new PasswordAuthError('VALIDATION_ERROR');
  const displayName=typeof value.displayName==='string'?value.displayName.trim():'';
  if (registration && (!displayName || displayName.length>200 || /[\x00-\x1f]/.test(displayName))) throw new PasswordAuthError('VALIDATION_ERROR');
  return {email,password,displayName};
}
function derive(password:string,salt:Buffer):Promise<Buffer> {
  return new Promise((resolve,reject)=>scrypt(password,salt,64,{N:131072,r:8,p:1,maxmem:160*1024*1024},(error,key)=>error?reject(error):resolve(key)));
}
export class PasswordAuthService {
  private running=0;
  private readonly store: PasswordCredentialStore;
  private readonly sessions: SessionService;
  constructor(store:PasswordCredentialStore,sessions:SessionService) { this.store = store; this.sessions = sessions; }
  private async bounded<T>(work:()=>Promise<T>):Promise<T> {
    if(this.running>=2) throw new PasswordAuthError('AUTH_BUSY');
    this.running++;try{return await work();}finally{this.running--;}
  }
  async register(body:unknown) {
    const value=input(body,true);
    return this.bounded(async()=>{
      const salt=randomBytes(16),key=await derive(value.password,salt);
      const passwordHash=`scrypt$131072$8$1$${salt.toString('hex')}$${key.toString('hex')}`;
      if(!await this.store.create({email:value.email,displayName:value.displayName,passwordHash})) throw new PasswordAuthError('DUPLICATE_IDENTITY');
      return {registered:true};
    });
  }
  async login(body:unknown) {
    const value=input(body,false);
    return this.bounded(async()=>{
      const credential=await this.store.find(value.email);
      const parts=credential?.passwordHash.split('$');
      const valid=parts?.length===6 && parts.slice(0,4).join('$')==='scrypt$131072$8$1' && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
      const salt=valid?Buffer.from(parts![4],'hex'):Buffer.alloc(16);
      const key=await derive(value.password,salt);
      if(!valid || !timingSafeEqual(key,Buffer.from(parts![5],'hex')) || credential?.status!=='ACTIVE') throw new PasswordAuthError('INVALID_CREDENTIALS');
      return this.sessions.createSession({userId:credential.userId,subject:{issuer:PASSWORD_ISSUER,subject:credential.userId}});
    });
  }
}
