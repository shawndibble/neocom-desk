import type { ChartColor } from './types';

export const CHART_COLOR: Record<ChartColor, string> = {
  accent: 'var(--color-accent)',
  neutral: 'var(--color-text-dim)',
  warning: 'var(--color-warning)',
  iskPos: 'var(--color-isk-pos)',
  iskNeg: 'var(--color-isk-neg)',
  s1: 'var(--color-kind-calendar-event)',
  s2: 'var(--color-kind-skill-training)',
  s3: 'var(--color-kind-planet-extraction)',
  s4: 'var(--color-kind-shared-moon-pop)',
  s5: 'var(--color-kind-order-expiry)',
};
