import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UsersService } from '../../modules/users/users.service.js';
import { ApiException } from '../http/api-exception.js';
import type { AuthenticatedRequest } from '../context/request-context.js';

/**
 * Gate for the platform-wide admin API. Distinct from `WorkspaceGuard`/`PermissionsGuard`:
 * there is no workspace in scope here at all, and `isPlatformAdmin` is a flag on `User`,
 * not a workspace role — a workspace's 'admin' role preset grants no access here.
 *
 * Looks the flag up fresh from the database on every request (not embedded in the JWT)
 * so revoking admin access takes effect immediately, not just after the access token
 * expires. This endpoint set is low-traffic enough that the extra query is a non-issue.
 */
@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly users: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.users.findById(req.user.id);
    if (!user || user.isSuspended) throw ApiException.unauthorized('Account is not active.');
    if (!user.isPlatformAdmin) throw ApiException.forbidden('Platform admin access is required.');
    return true;
  }
}
