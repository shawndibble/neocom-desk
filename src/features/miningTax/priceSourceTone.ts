import type { PriceSource } from '@/engine/miningTax/priceBasis';

/** The Overview ledger's price-source tag colours — the reference the rate chart's bars follow. */
export const SOURCE_TAG_CLASS: Record<PriceSource, string> = {
  saved: 'border-line-bright text-text-dim',
  historical: 'border-success/50 text-success',
  average: 'border-warning/50 text-warning',
  live: 'border-accent-dim text-accent',
  none: 'border-line text-text-dim',
};

/**
 * Rate-chart bar colour per price source (issue #2225): each borrows the token
 * its tag above already uses — the tag's text colour, or for No price its
 * border, so it never shares Saved's neutral. Accent stays Live's alone.
 */
export const SOURCE_FILL: Record<PriceSource, string> = {
  saved: 'var(--color-text-dim)',
  historical: 'var(--color-success)',
  average: 'var(--color-warning)',
  live: 'var(--color-accent)',
  none: 'var(--color-line)',
};
