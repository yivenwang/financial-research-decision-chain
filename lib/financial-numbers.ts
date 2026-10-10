// Fail closed without coercing null, blank text, or non-finite values to numbers.
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function finiteChange(current: unknown, comparison: unknown, ratio = false): number | null {
  if (!isFiniteNumber(current) || !isFiniteNumber(comparison) || (!ratio && comparison === 0)) return null;
  const difference = current - comparison;
  if (!Number.isFinite(difference)) return null;
  const change = ratio ? difference : difference / Math.abs(comparison);
  return Number.isFinite(change) ? change : null;
}
