/**
 * Lexicographic fractional ranking for ordered lists (board columns, tasks in a
 * column, checklist items, ...). Instead of storing integer positions and
 * rewriting every row on reorder, each item stores a short string `rank`. Moving
 * an item is an O(1) write: compute a key strictly between its new neighbours.
 *
 * Implementation is the well-proven `fractional-indexing` midpoint algorithm
 * (rocicorp, MIT), specialised to a single ordering space (no integer prefix).
 * Alphabet is 62 URL-safe alphanumerics in ASCII order, so plain string
 * comparison — and a MongoDB index on `rank` — sorts correctly.
 */
const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const ZERO = DIGITS[0]!;

function assertValid(key: string, name: string): void {
  if (key === '') return;
  for (const ch of key) {
    if (DIGITS.indexOf(ch) < 0) throw new Error(`lexorank: ${name} has illegal char ${JSON.stringify(ch)}`);
  }
  if (key.endsWith(ZERO)) throw new Error(`lexorank: ${name} must not end with a zero digit`);
}

function midpoint(a: string, b: string | null): string {
  if (b !== null && a >= b) throw new Error(`lexorank: lower "${a}" must sort before upper "${b}"`);

  if (b !== null) {
    let n = 0;
    while ((a[n] ?? ZERO) === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }

  const digitA = a !== '' ? DIGITS.indexOf(a[0]!) : 0;
  const digitB = b !== null && b !== '' ? DIGITS.indexOf(b[0]!) : DIGITS.length;

  if (digitB - digitA > 1) {
    return DIGITS[Math.round(0.5 * (digitA + digitB))]!;
  }
  if (b !== null && b.length > 1) {
    return b.slice(0, 1);
  }
  return DIGITS[digitA]! + midpoint(a.slice(1), null);
}

/**
 * Returns a rank string `r` such that `lower < r < upper` under string ordering.
 * Pass `null` for an open bound (start or end of the list).
 */
export function rankBetween(lower: string | null, upper: string | null): string {
  const lo = lower ?? '';
  const hi = upper;
  assertValid(lo, 'lower');
  if (hi !== null) assertValid(hi, 'upper');
  return midpoint(lo, hi);
}

/** A rank that sorts after everything currently in the list. */
export function rankAfter(last: string | null): string {
  return rankBetween(last, null);
}

/** A rank that sorts before everything currently in the list. */
export function rankBefore(first: string | null): string {
  return rankBetween(null, first);
}

/** Evenly spaced ranks for an initial bulk insert of `count` items. */
export function initialRanks(count: number): string[] {
  const ranks: string[] = [];
  let prev: string | null = null;
  for (let n = 0; n < count; n += 1) {
    prev = rankBetween(prev, null);
    ranks.push(prev);
  }
  return ranks;
}

export const LEXORANK_DIGITS = DIGITS;
