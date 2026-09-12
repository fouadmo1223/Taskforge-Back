import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/context/request-context.js';
import { ApiException } from '../../common/http/api-exception.js';

/**
 * Runs after {@link import('../../common/guards/workspace.guard.js').WorkspaceGuard}.
 * Confirms the caller is a **client** member linked to a {@link Client} record and
 * exposes nothing unless that is true. Every portal query is then scoped to
 * `req.membership.clientId` — never a value from the request body.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const ctx = req.membership;
    if (!ctx) throw ApiException.forbidden('This route is not workspace-scoped.');
    if (!ctx.isClient || !ctx.clientId) {
      throw ApiException.forbidden('The client portal is only available to client accounts.');
    }
    return true;
  }
}
