export const COMPARE_REGION_STROKES = [
  { color: 'var(--color-kind-calendar-event)', dash: '6 3' },
  { color: 'var(--color-kind-planet-extraction)', dash: '2 3' },
  { color: 'var(--color-kind-contract-expiry)', dash: '10 3 2 3' },
  { color: 'var(--color-kind-skill-training)', dash: '1 2' },
] as const;

export function compareRegionStroke(slot: number): { color: string; dash: string } {
  return COMPARE_REGION_STROKES[slot % COMPARE_REGION_STROKES.length]!;
}

const OPEN_SELL_WIDTH = 2.5;
const OPEN_BUY_WIDTH = 1.25;

export const PRIMARY_REGION_STROKE = { color: 'var(--color-accent)', dash: undefined } as const;

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
