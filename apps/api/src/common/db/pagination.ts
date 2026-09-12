import { Types } from 'mongoose';
import type { CursorPage, OffsetPage } from '@flowdesk/types';

export function offsetPage<T>(items: T[], total: number, page: number, pageSize: number): OffsetPage<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/**
 * Encodes/decodes an opaque cursor for keyset pagination on an ObjectId `_id`
 * (or any monotonic field passed as a string). Base64url of `field|value`.
 */
export const cursor = {
  encode(value: string): string {
    return Buffer.from(value, 'utf8').toString('base64url');
  },
  decode(raw: string | undefined | null): string | null {
    if (!raw) return null;
    try {
      return Buffer.from(raw, 'base64url').toString('utf8');
    } catch {
      return null;
    }
  },
  /** Build a `_id`-keyset filter fragment for a decoded cursor. */
  idFilter(decoded: string | null, direction: 'asc' | 'desc'): Record<string, unknown> {
    if (!decoded || !Types.ObjectId.isValid(decoded)) return {};
    const op = direction === 'asc' ? '$gt' : '$lt';
    return { _id: { [op]: new Types.ObjectId(decoded) } };
  },
};

export function cursorPage<T extends { id: string }>(rows: T[], limit: number): CursorPage<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? cursor.encode(last.id) : null,
  };
}
