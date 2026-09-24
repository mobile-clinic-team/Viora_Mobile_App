import type {
  IdentitySubjectReference,
  Membership,
  UserIdentity,
} from '../../contracts/src/index.ts';

export interface IdentityContextStore {
  findUserBySubject(
    subject: IdentitySubjectReference,
  ): Promise<UserIdentity | null>;

  findMembershipsByUser(
    userId: string,
  ): Promise<readonly Membership[]>;
}
