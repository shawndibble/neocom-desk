/**
 * Ore layer colours for the Survey tab. Kept out of `SurveyCharts.tsx` so the
 * board and the chart agree on them without the board importing Recharts.
 * They borrow the clock-kind tokens (DESIGN.md), the rule for every
 * categorical series, so there is no parallel palette.
 */
import type { ValueTier } from '@/engine/survey/valueTier';

const ORE_TONES = [
  'var(--color-kind-industry-job)',
  'var(--color-kind-planet-extraction)',
  'var(--color-kind-calendar-event)',
  'var(--color-kind-skill-training)',
  'var(--color-kind-order-expiry)',
  'var(--color-kind-contract-expiry)',
  'var(--color-kind-skill-plan)',
  'var(--color-kind-moon-chunk)',
];

export const oreTone = (index: number): string => ORE_TONES[Math.max(0, index) % ORE_TONES.length];

/**
 * The ore bars' value ramp, gray to orange by ISK per m³ left (`valueTier.ts`).
 * It follows Kill heat's rule (DESIGN.md): yellow is `warning`, orange is
 * halfway from `warning` to `danger`, and the low end is a neutral, so the
 * hue itself says "hotter" without a new palette.
 */
export const VALUE_TIER_COLORS: Record<ValueTier, string> = {
  gray: 'var(--color-line-bright)',
  blue: 'var(--color-accent)',
  yellow: 'var(--color-warning)',
  orange: 'color-mix(in oklab, var(--color-warning) 50%, var(--color-danger))',
};

/** Low to high, for a legend. */
export const VALUE_TIER_ORDER: readonly ValueTier[] = ['gray', 'blue', 'yellow', 'orange'];
