/** Uniform success envelope returned by every REST endpoint. */
export interface ApiEnvelope<T> {
  data: T;
  meta?: ApiMeta;
}

export interface ApiMeta {
  [key: string]: unknown;
}

/** Uniform error body. `code` is a stable machine string; `message` is human text. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    /** field-level validation details, when applicable */
    details?: ApiFieldError[];
    /** correlation id for support / logs */
    traceId?: string;
  };
}

export interface ApiFieldError {
  field: string;
  message: string;
}

export type ApiErrorCode =
  | 'validation_error'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unprocessable'
  | 'internal_error'
  | 'service_unavailable'
  | 'invite_invalid'
  | 'invite_email_mismatch';

/** Offset pagination result. */
export interface OffsetPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Cursor pagination result (preferred for large/append-heavy collections). */
export interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface OffsetQuery {
  page?: number;
  pageSize?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface CursorQuery {
  cursor?: string | null;
  limit?: number;
}
