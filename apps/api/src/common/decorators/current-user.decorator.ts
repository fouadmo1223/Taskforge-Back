import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, RequestUser } from '../context/request-context.js';

/** Injects `req.user` (or a single field of it) into a handler parameter. */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, ctx: ExecutionContext): RequestUser | string => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return field ? req.user[field] : req.user;
  },
);
