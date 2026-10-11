/**
 * Chart colour -> CSS custom property. Complete references to tokens the app
 * already owns (`src/styles/index.css`); no new hue is minted here. The five
 * series slots are the nominal `kind-*` hues in the Net Worth layer order
 * (`features/netWorth/layerMeta.ts`), so a layer is the same colour on the
 * widget and on its page. None is red: a data series must never read as an
 * alert about the data.
 */
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
  s4: 'var(--color-kind-skill-plan)',
  s5: 'var(--color-kind-order-expiry)',
};
