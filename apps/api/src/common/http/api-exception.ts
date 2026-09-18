import { HttpException, HttpStatus } from '@nestjs/common';
import type { ApiErrorCode, ApiFieldError } from '@flowdesk/types';

const STATUS_BY_CODE: Record<ApiErrorCode, HttpStatus> = {
  validation_error: HttpStatus.BAD_REQUEST,
  unauthorized: HttpStatus.UNAUTHORIZED,
  forbidden: HttpStatus.FORBIDDEN,
  not_found: HttpStatus.NOT_FOUND,
  conflict: HttpStatus.CONFLICT,
  rate_limited: HttpStatus.TOO_MANY_REQUESTS,
  payload_too_large: HttpStatus.PAYLOAD_TOO_LARGE,
  unprocessable: HttpStatus.UNPROCESSABLE_ENTITY,
  internal_error: HttpStatus.INTERNAL_SERVER_ERROR,
  service_unavailable: HttpStatus.SERVICE_UNAVAILABLE,
  invite_invalid: HttpStatus.BAD_REQUEST,
  invite_email_mismatch: HttpStatus.FORBIDDEN,
};

/**
 * The single exception type domain code should throw. The global filter renders
 * it into the uniform `ApiErrorBody`. Never leak Mongo/driver errors past a
 * service boundary — catch and wrap them in one of these.
 */
export class ApiException extends HttpException {
  readonly code: ApiErrorCode;
  readonly details?: ApiFieldError[];

  constructor(code: ApiErrorCode, message: string, details?: ApiFieldError[]) {
    super({ code, message, details }, STATUS_BY_CODE[code]);
    this.code = code;
    this.details = details;
  }

  static notFound(what = 'Resource'): ApiException {
    return new ApiException('not_found', `${what} not found.`);
  }

  static forbidden(message = 'You do not have permission to perform this action.'): ApiException {
    return new ApiException('forbidden', message);
  }

  static unauthorized(message = 'Authentication is required.'): ApiException {
    return new ApiException('unauthorized', message);
  }

  static conflict(message: string): ApiException {
    return new ApiException('conflict', message);
  }

  static validation(message: string, details?: ApiFieldError[]): ApiException {
    return new ApiException('validation_error', message, details);
  }

  static unprocessable(message: string, details?: ApiFieldError[]): ApiException {
    return new ApiException('unprocessable', message, details);
  }
}
