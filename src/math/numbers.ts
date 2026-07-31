export function clamp(value: number, min: number, max: number, fallback = min) {
  if (value === Number.POSITIVE_INFINITY) return max;
  if (value === Number.NEGATIVE_INFINITY) return min;
  return Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
