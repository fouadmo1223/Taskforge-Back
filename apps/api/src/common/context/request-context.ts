import type { Permission } from '@flowdesk/types';

/** Attached to `req.user` by {@link JwtStrategy} after a valid access token. */
export interface RequestUser {
  id: string;
  email: string;
  /** refresh-session (token family) id this access token belongs to */
  sessionId: string;
}

/**
 * Attached to `req.membership` by {@link WorkspaceGuard} once the caller is
 * confirmed to be an active member of the `:workspaceId` in the route. Downstream
 * guards and services trust this and nothing from the client body.
 */
export interface WorkspaceMembershipContext {
  membershipId: string;
  workspaceId: string;
  userId: string;
  roleId: string;
  roleKey: string;
  permissions: ReadonlySet<Permission>;
  isClient: boolean;
  /** Set when `isClient` — the Client record this portal user is scoped to. */
  clientId: string | null;
  isOwner: boolean;
}

export interface AuthenticatedRequest extends Express.Request {
  user: RequestUser;
  membership?: WorkspaceMembershipContext;
}

export function hasPermission(ctx: WorkspaceMembershipContext, permission: Permission): boolean {
  return ctx.isOwner || ctx.permissions.has(permission);
}

export function hasAnyPermission(ctx: WorkspaceMembershipContext, permissions: Permission[]): boolean {
  return ctx.isOwner || permissions.some((p) => ctx.permissions.has(p));
}

export function hasAllPermissions(ctx: WorkspaceMembershipContext, permissions: Permission[]): boolean {
  return ctx.isOwner || permissions.every((p) => ctx.permissions.has(p));
}
