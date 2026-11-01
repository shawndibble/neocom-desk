/** How the refine breakdown writes a yield or efficiency: a share of each portion, one decimal. */

/** A fraction as a percentage: 0.683 -> "68.3%". */
export function pct(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** One efficiency, or the span when items differ in the specialisation skill that applies to them. */
export function efficiencyText(min: number | null, max: number | null): string {
  if (min === null || max === null) return '—';
  return min === max ? pct(min) : `${pct(min)} – ${pct(max)}`;
}

/** The skills multiplier on the facility yield: "×1.366", or a span. */
export function skillsText(min: number | null, max: number | null, yieldRate: number): string {
  if (min === null || max === null || yieldRate <= 0) return '—';
  const low = (min / yieldRate).toFixed(3);
  const high = (max / yieldRate).toFixed(3);
  return low === high ? `×${low}` : `×${low} – ${high}`;
}
