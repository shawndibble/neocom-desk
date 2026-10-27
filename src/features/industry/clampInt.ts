/**
 * Clamps a user-entered number into an engine range, rounding first — a
 * cleared or invalid input (NaN, ±Infinity) falls to `min` rather than
 * blanking whatever reads it. Its own module, not a `computeBuildPlan.ts`
 * export, so a test that mocks that module never loses this with it.
 */
export function clampInt(value: number, min: number, max: number): number {
  const n = Math.round(Number(value));
  return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}
