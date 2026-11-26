export const MIN_RATE = 1;
export const MAX_RATE = 200;
export const MAX_BUY_LINES = 50;
export const RATE_BASES = ['buy', 'sell'] as const;
export const BUYBACK_GROUP_KEYS = ['ore', 'ice', 'minerals', 'gas', 'pi', 'salvage'] as const;
export const BUYBACK_HUB_IDS = ['jita', 'amarr', 'dodixie', 'rens', 'hek'] as const;

export type RateBasis = (typeof RATE_BASES)[number];
export type BuybackGroup = (typeof BUYBACK_GROUP_KEYS)[number];
export type BuybackHubId = (typeof BUYBACK_HUB_IDS)[number];

export function isValidRate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_RATE &&
    value <= MAX_RATE &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-9
  );
}
