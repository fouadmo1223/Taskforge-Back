export * from './lexorank.js';
export * from './text.js';
export * from './graph.js';

/** Exhaustiveness guard for switch statements over unions. */
export function assertNever(value: never, context = 'value'): never {
  throw new Error(`Unexpected ${context}: ${JSON.stringify(value)}`);
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Normalise offset-pagination query params against safe bounds. */
export function normalizePageParams(
  input: { page?: number; pageSize?: number } | undefined,
  opts: { defaultSize?: number; maxSize?: number } = {},
): { page: number; pageSize: number; skip: number } {
  const defaultSize = opts.defaultSize ?? 25;
  const maxSize = opts.maxSize ?? 100;
  const page = Math.max(1, Math.floor(input?.page ?? 1));
  const pageSize = clamp(Math.floor(input?.pageSize ?? defaultSize), 1, maxSize);
  return { page, pageSize, skip: (page - 1) * pageSize };
}
