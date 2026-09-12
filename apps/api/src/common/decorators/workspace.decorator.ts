import { createParamDecorator, SetMetadata, type ExecutionContext } from '@nestjs/common';
import type { Permission } from '@flowdesk/types';
import { ApiException } from '../http/api-exception.js';
import type { AuthenticatedRequest, WorkspaceMembershipContext } from '../context/request-context.js';

export const REQUIRED_PERMISSIONS = 'flowdesk:required_permissions';
export const PERMISSION_MODE = 'flowdesk:permission_mode';

/**
 * Declares the workspace permission(s) a route needs. `PermissionsGuard` reads
 * this together with the {@link WorkspaceMembershipContext} that `WorkspaceGuard`
 * attached. Default mode is `all` (caller must hold every listed permission).
 */
export function RequirePermissions(...permissions: Permission[]): MethodDecorator & ClassDecorator {
  return SetMetadata(REQUIRED_PERMISSIONS, permissions);
}

/** Variant of {@link RequirePermissions} where holding any one permission passes. */
export function RequireAnyPermission(...permissions: Permission[]): MethodDecorator & ClassDecorator {
  return (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
    SetMetadata(REQUIRED_PERMISSIONS, permissions)(target, key!, descriptor!);
    SetMetadata(PERMISSION_MODE, 'any')(target, key!, descriptor!);
  };
}

/** Injects the verified `req.membership` context. Throws if the route is not workspace-scoped. */
export const Membership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): WorkspaceMembershipContext => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.membership) {
      throw ApiException.forbidden('This route is not workspace-scoped.');
    }
    return req.membership;
  },
);

/** Shorthand for just the workspace id from the verified membership context. */
export const WorkspaceId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  if (!req.membership) throw ApiException.forbidden('This route is not workspace-scoped.');
  return req.membership.workspaceId;
});
