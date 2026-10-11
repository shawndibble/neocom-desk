/**
 * The line each compared region draws on the Price History chart, by pick
 * slot. Borrowed from the clock-kind nominal set rather than minted
 * (DESIGN.md "Chart series"), and each slot carries its own dash as well, so
 * colour is never the only thing telling two regions apart — the legend and
 * tooltip name each one too. None is solid (the primary average) or `4 3`
 * (the moving average), and none is near the order-count amber.
 */
export const COMPARE_REGION_STROKES = [
  { color: 'var(--color-kind-calendar-event)', dash: '6 3' },
  { color: 'var(--color-kind-planet-extraction)', dash: '2 3' },
  { color: 'var(--color-kind-contract-expiry)', dash: '10 3 2 3' },
  { color: 'var(--color-kind-skill-training)', dash: '1 2' },
] as const;

export function compareRegionStroke(slot: number): { color: string; dash: string } {
  return COMPARE_REGION_STROKES[slot % COMPARE_REGION_STROKES.length]!;
}
