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

/** Line weights of a region's open-price lines: Sell is the heavier one. */
const OPEN_SELL_WIDTH = 2.5;
const OPEN_BUY_WIDTH = 1.25;

/** The primary region's line: the accent, solid (its average line is solid too). */
export const PRIMARY_REGION_STROKE = { color: 'var(--color-accent)', dash: undefined } as const;

/**
 * A region's open-price lines (Buy / Sell). Two cues, neither of them colour:
 * the region is told by its dash pattern (the primary solid, each compared slot
 * its own, as for its average line) and the side by weight (Sell heavy, Buy
 * light). The region's colour is shared by both of its lines. `region` is the
 * primary's stroke or `compareRegionStroke(slot)`.
 */
export function openPriceStroke(
  region: { color: string; dash: string | undefined },
  side: 'buy' | 'sell'
): { color: string; dash: string | undefined; width: number } {
  return {
    color: region.color,
    dash: region.dash,
    width: side === 'sell' ? OPEN_SELL_WIDTH : OPEN_BUY_WIDTH,
  };
}
