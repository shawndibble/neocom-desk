import type { ValueTier } from '@/engine/survey/valueTier';

const ORE_TONES = [
  'var(--color-kind-industry-job)',
  'var(--color-kind-planet-extraction)',
  'var(--color-kind-calendar-event)',
  'var(--color-kind-skill-training)',
  'var(--color-kind-order-expiry)',
  'var(--color-kind-contract-expiry)',
  'var(--color-kind-shared-moon-pop)',
  'var(--color-kind-moon-chunk)',
];

export const oreTone = (index: number): string => ORE_TONES[Math.max(0, index) % ORE_TONES.length];

export const VALUE_TIER_COLORS: Record<ValueTier, string> = {
  gray: 'var(--color-line-bright)',
  blue: 'var(--color-accent)',
  yellow: 'var(--color-warning)',
  orange: 'color-mix(in oklab, var(--color-warning) 50%, var(--color-danger))',
};

export const VALUE_TIER_ORDER: readonly ValueTier[] = ['gray', 'blue', 'yellow', 'orange'];
