/**
 * Ore layer colours for the Survey tab. Kept out of `SurveyCharts.tsx` so the
 * board and the chart agree on them without the board importing Recharts.
 * They borrow the clock-kind tokens (DESIGN.md), the rule for every
 * categorical series, so there is no parallel palette.
 */
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
