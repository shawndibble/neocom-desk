import type { PriceSource } from '@/engine/miningTax/priceBasis';

/** The Overview ledger's price-source tag colours — the reference the rate chart's bars follow. */
export const SOURCE_TAG_CLASS: Record<PriceSource, string> = {
  saved: 'text-text-dim',
  historical: 'text-success',
  average: 'text-warning',
  live: 'text-text',
  none: 'text-text-dim',
};

/**
 * Rate-chart bar colour per price source (issue #2225): each borrows the token
 * its tag above already uses — the tag's text colour, so it never shares
 * Saved's neutral. Accent means clickable (§6c), so no source uses it. No price's
 * tag stays dim (faint is decorative only); only its chart fill is faint.
 */
export const SOURCE_FILL: Record<PriceSource, string> = {
  saved: 'var(--color-text-dim)',
  historical: 'var(--color-success)',
  average: 'var(--color-warning)',
  live: 'var(--color-text)',
  none: 'var(--color-text-faint)',
};
