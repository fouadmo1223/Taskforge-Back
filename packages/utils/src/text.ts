/** URL-safe slug. Keeps Arabic letters (only strips punctuation/whitespace runs). */
export function slugify(input: string): string {
  return input
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/** `slugify` plus a short random suffix, for guaranteed-unique slugs. */
export function slugWithSuffix(input: string, size = 6): string {
  const base = slugify(input) || 'item';
  const suffix = Math.random()
    .toString(36)
    .slice(2, 2 + size);
  return `${base}-${suffix}`;
}

/** Deterministic short code, e.g. project keys `MKT`, `ENG`. */
export function initialsCode(input: string, length = 3): string {
  const letters = input
    .normalize('NFKC')
    .replace(/[^\p{Letter}\s]/gu, '')
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (letters.length === 0) return 'PRJ';
  const code =
    letters.length === 1
      ? letters[0]!.slice(0, length)
      : letters
          .slice(0, length)
          .map((w) => w[0]!)
          .join('');
  return code.toUpperCase().padEnd(2, 'X');
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`;
}
