import type { UserModel } from '../../../generated/prisma/models';

/** Minimal user payload carried by the authenticated request. */
export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
}

/** Public user profile (no password/hash fields). */
export type PublicUser = Pick<
  UserModel,
  'id' | 'name' | 'email' | 'avatarUrl' | 'createdAt'
>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}
