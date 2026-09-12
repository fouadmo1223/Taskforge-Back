import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import type { ApiEnvelope } from '@flowdesk/types';
import { RAW_RESPONSE } from '../decorators/raw-response.decorator.js';

/**
 * Wraps every controller return value in `{ data, meta }`. A handler that already
 * returns that shape (`{ data, meta }`) is passed through untouched, so paginated
 * endpoints can set their own `meta`. Opt out entirely with `@RawResponse()`
 * (file downloads, webhooks that must echo a bare body, ...).
 */
@Injectable()
export class TransformInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (raw) return next.handle();

    return next.handle().pipe(
      map((payload): ApiEnvelope<unknown> => {
        if (payload && typeof payload === 'object' && 'data' in payload && Object.keys(payload).every((k) => k === 'data' || k === 'meta')) {
          return payload as ApiEnvelope<unknown>;
        }
        return { data: payload ?? null };
      }),
    );
  }
}
