import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@flowdesk/types';
import { hasAllPermissions, hasAnyPermission, type AuthenticatedRequest } from '../context/request-context.js';
import { PERMISSION_MODE, REQUIRED_PERMISSIONS } from '../decorators/workspace.decorator.js';
import { ApiException } from '../http/api-exception.js';

/**
 * Enforces `@RequirePermissions(...)` / `@RequireAnyPermission(...)` against the
 * verified `req.membership` that {@link WorkspaceGuard} attached. Must run after
 * `WorkspaceGuard` in the guard chain.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const mode = this.reflector.getAllAndOverride<'any' | 'all' | undefined>(PERMISSION_MODE, [
      context.getHandler(),
      context.getClass(),
    ]);

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ctx = req.membership;
    if (!ctx) throw ApiException.forbidden('Workspace context is missing for this route.');

    const ok = mode === 'any' ? hasAnyPermission(ctx, required) : hasAllPermissions(ctx, required);
    if (!ok) {
      throw ApiException.forbidden(
        `This action requires the ${required.join(mode === 'any' ? ' or ' : ' and ')} permission${required.length > 1 ? 's' : ''}.`,
      );
    }
    return true;
  }
}
