import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Error as MongooseError, mongo } from 'mongoose';

const { MongoServerError } = mongo;
import { randomUUID } from 'node:crypto';
import type { ApiErrorBody, ApiErrorCode, ApiFieldError } from '@flowdesk/types';
import { ApiException } from './api-exception.js';

/**
 * Terminal error boundary for the REST surface. Produces the uniform
 * `ApiErrorBody`, attaches a `traceId`, logs 5xx with context, and makes sure no
 * raw database or stack detail ever reaches the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Http');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const traceId = (req.headers['x-trace-id'] as string) || randomUUID();

    const { status, code, message, details } = this.normalize(exception);

    if (status >= 500) {
      this.logger.error(
        `${req.method} ${req.originalUrl} -> ${status} ${code} [${traceId}]: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${req.method} ${req.originalUrl} -> ${status} ${code} [${traceId}]: ${message}`);
    }

    const body: ApiErrorBody = { error: { code, message, traceId, ...(details ? { details } : {}) } };
    res.status(status).json(body);
  }

  private normalize(exception: unknown): {
    status: number;
    code: ApiErrorCode;
    message: string;
    details?: ApiFieldError[];
  } {
    if (exception instanceof ApiException) {
      const body = exception.getResponse() as { code: ApiErrorCode; message: string; details?: ApiFieldError[] };
      return { status: exception.getStatus(), code: body.code, message: body.message, details: body.details };
    }

    if (exception instanceof ThrottlerException) {
      return { status: HttpStatus.TOO_MANY_REQUESTS, code: 'rate_limited', message: 'Too many requests. Please slow down.' };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const message =
        typeof raw === 'string'
          ? raw
          : Array.isArray((raw as { message?: unknown }).message)
            ? 'Request validation failed.'
            : String((raw as { message?: unknown }).message ?? exception.message);
      const details = this.extractValidationDetails(raw);
      return { status, code: this.codeForStatus(status), message, details };
    }

    if (exception instanceof MongooseError.ValidationError) {
      const details: ApiFieldError[] = Object.values(exception.errors).map((e) => ({
        field: e.path,
        message: e.message,
      }));
      return { status: HttpStatus.BAD_REQUEST, code: 'validation_error', message: 'Request validation failed.', details };
    }

    if (exception instanceof MongoServerError && exception.code === 11000) {
      const field = Object.keys(exception.keyPattern ?? { value: 1 })[0] ?? 'value';
      return {
        status: HttpStatus.CONFLICT,
        code: 'conflict',
        message: `A record with that ${field} already exists.`,
      };
    }

    if (exception instanceof MongooseError.CastError) {
      return { status: HttpStatus.BAD_REQUEST, code: 'validation_error', message: `Malformed identifier for ${exception.path}.` };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'internal_error',
      message: 'Something went wrong on our end. Please try again.',
    };
  }

  private extractValidationDetails(raw: unknown): ApiFieldError[] | undefined {
    if (!raw || typeof raw !== 'object') return undefined;
    const msg = (raw as { message?: unknown }).message;
    if (!Array.isArray(msg)) return undefined;
    return msg.map((m) => ({ field: '_', message: String(m) }));
  }

  private codeForStatus(status: number): ApiErrorCode {
    switch (status) {
      case 400:
        return 'validation_error';
      case 401:
        return 'unauthorized';
      case 403:
        return 'forbidden';
      case 404:
        return 'not_found';
      case 409:
        return 'conflict';
      case 413:
        return 'payload_too_large';
      case 422:
        return 'unprocessable';
      case 429:
        return 'rate_limited';
      case 503:
        return 'service_unavailable';
      default:
        return status >= 500 ? 'internal_error' : 'validation_error';
    }
  }
}
