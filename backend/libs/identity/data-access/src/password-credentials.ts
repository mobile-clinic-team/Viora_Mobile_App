import { randomUUID } from 'node:crypto';
import type { TransactionalDatabase } from '../../../platform/database/src/index.ts';
import { PASSWORD_ISSUER, type PasswordCredentialStore } from '../../domain/src/password-credentials.ts';

export class PostgresPasswordCredentials implements PasswordCredentialStore {
  private readonly db: TransactionalDatabase;
  constructor(db: TransactionalDatabase) { this.db = db; }
  async create(input: { email: string; displayName: string; passwordHash: string }): Promise<boolean> {
    try {
      return await this.db.transaction(async tx => {
        // Serialize registrations of the same normalized identity, including races.
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.email]);
        if ((await tx.query('SELECT id FROM users WHERE lower(email)=$1', [input.email])).rows.length) return false;
        const id = randomUUID();
        await tx.query(`INSERT INTO users(id,email,display_name,status,created_at,updated_at)
          VALUES($1,$2,$3,'ACTIVE',now(),now())`, [id,input.email,input.displayName]);
        await tx.query('INSERT INTO identity_subjects(issuer,subject,user_id,created_at) VALUES($1,$2,$3,now())', [PASSWORD_ISSUER,id,id]);
        await tx.query('INSERT INTO password_credentials(email,user_id,password_hash) VALUES($1,$2,$3)', [input.email,id,input.passwordHash]);
        return true;
      });
    } catch (error) {
      if ((error as {code?:string}).code === '23505') return false;
      throw error;
    }
  }
  async find(email: string) {
    const row = (await this.db.query(`SELECT c.user_id,c.password_hash,u.status FROM password_credentials c
      JOIN users u ON u.id=c.user_id WHERE c.email=$1`, [email])).rows[0];
    return row ? {userId:String(row.user_id),passwordHash:String(row.password_hash),status:String(row.status)} : null;
  }
}
