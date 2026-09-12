import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { MembershipsService } from '../../modules/memberships/memberships.service.js';
import type { AuthenticatedRequest } from '../context/request-context.js';
import { ApiException } from '../http/api-exception.js';

/**
 * Establishes and verifies the workspace tenancy boundary for a route. Expects a
 * `:workspaceId` (or `:workspace`) route param. Confirms the authenticated user
 * is an **active** member and attaches the resolved
 * {@link import('../context/request-context.js').WorkspaceMembershipContext} to
 * `req.membership`. Everything downstream trusts that context, never the body.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(private readonly memberships: MembershipsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest & { params: Record<string, string> }>();
    if (!req.user) throw ApiException.unauthorized();

    const workspaceId = req.params.workspaceId ?? req.params.workspace;
    if (!workspaceId) {
      throw ApiException.validation('This route requires a workspace id.');
    }

    const membership = await this.memberships.resolveContext(workspaceId, req.user.id);
    if (!membership) {
      // Same response whether the workspace is missing or the user simply is not
      // a member — never confirm existence of another tenant's resources.
      throw ApiException.forbidden('You do not have access to this workspace.');
    }

    req.membership = membership;
    return true;
  }
}
