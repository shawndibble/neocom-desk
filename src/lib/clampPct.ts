/** Clamp a percentage to 0–100. */
export function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value));
}
