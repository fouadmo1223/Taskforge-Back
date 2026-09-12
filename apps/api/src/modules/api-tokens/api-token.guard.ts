import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@flowdesk/types';
import { ApiException } from '../../common/http/api-exception.js';
import { ApiTokensService, type ResolvedApiToken } from './api-tokens.service.js';

export const API_SCOPES = 'flowdesk:api_scopes';

/** Declares the token scope(s) an external-API route needs (all required). */
export const RequireApiScopes = (...scopes: Permission[]): MethodDecorator & ClassDecorator =>
  SetMetadata(API_SCOPES, scopes);

export interface ApiTokenRequest extends Express.Request {
  apiToken?: ResolvedApiToken;
  params: Record<string, string>;
}

/**
 * Authenticates `Authorization: Bearer fdk_…` personal-access tokens for the
 * `/v1/*` external API. Attaches the resolved token to `req.apiToken` and
 * enforces both the token's workspace and its granted scopes.
 */
@Injectable()
export class ApiTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: ApiTokensService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<ApiTokenRequest & { headers: Record<string, string | undefined> }>();
    const header = req.headers.authorization ?? '';
    const raw = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!raw.startsWith('fdk_')) throw ApiException.unauthorized('A FlowDesk API token is required.');

    const resolved = await this.tokens.resolve(raw);
    if (!resolved) throw ApiException.unauthorized('Invalid or expired API token.');

    const routeWorkspace = req.params.workspaceId;
    if (routeWorkspace && routeWorkspace !== resolved.workspaceId) {
      throw ApiException.forbidden('This token cannot access that workspace.');
    }

    const required = this.reflector.getAllAndOverride<Permission[]>(API_SCOPES, [
      context.getHandler(),
      context.getClass(),
    ]) ?? [];
    const missing = required.find((s) => !resolved.scopes.has(s));
    if (missing) throw ApiException.forbidden(`This token is missing the "${missing}" scope.`);

    req.apiToken = resolved;
    return true;
  }
}
