import type { CloudinaryAsset, ID, Locale, ThemePreference } from './common.js';
import type { Permission } from './permissions.js';
import type { MembershipStatus } from './enums.js';

export interface AuthUser {
  id: ID;
  name: string;
  email: string;
  emailVerified: boolean;
  avatar: CloudinaryAsset | null;
  locale: Locale;
  theme: ThemePreference;
  /** platform-wide superuser flag — distinct from any per-workspace role */
  isPlatformAdmin: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  /** seconds until the access token expires */
  expiresIn: number;
}

export interface WorkspaceMembershipView {
  workspaceId: ID;
  workspaceName: string;
  workspaceSlug: string;
  status: MembershipStatus;
  roleId: ID;
  roleKey: string;
  roleName: string;
  permissions: Permission[];
  isClient: boolean;
}

export interface SessionView {
  id: ID;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

export interface LoginResult {
  user: AuthUser;
  tokens: AuthTokens;
  memberships: WorkspaceMembershipView[];
}

export interface JwtAccessClaims {
  sub: ID;
  email: string;
  /** token family id for the refresh session this access token belongs to */
  sid: ID;
  type: 'access';
}
