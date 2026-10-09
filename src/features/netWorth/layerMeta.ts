/**
 * Per-layer presentation for the net worth chart (issue #2935). Hues reuse the
 * existing nominal `kind-*` tokens (DESIGN §1) — no new palette. Colour is
 * never the only signal: the legend carries a swatch beside each label, and
 * gaps are hatched.
 */
import type { LayerId } from '@/engine/netWorth/series';

export const LAYER_LABEL_KEYS: Record<LayerId, string> = {
  isk: 'wallet.netWorth.layers.isk',
  assets: 'wallet.netWorth.layers.assets',
  escrow: 'wallet.netWorth.layers.escrow',
  sellOrders: 'wallet.netWorth.layers.sellOrders',
};

export const LAYER_COLOR: Record<LayerId, string> = {
  isk: 'var(--color-kind-planet-extraction)',
  assets: 'var(--color-kind-calendar-event)',
  escrow: 'var(--color-kind-skill-training)',
  sellOrders: 'var(--color-kind-skill-plan)',
};

export const LAYER_SWATCH: Record<LayerId, string> = {
  isk: 'bg-kind-planet-extraction',
  assets: 'bg-kind-calendar-event',
  escrow: 'bg-kind-skill-training',
  sellOrders: 'bg-kind-skill-plan',
};

/** Character line hues, cycled; a repeat gets a dash pattern so hue is never the only cue. */
export const CHARACTER_COLORS = [
  'var(--color-kind-contract-expiry)',
  'var(--color-kind-order-expiry)',
  'var(--color-kind-moon-chunk)',
  'var(--color-kind-calendar-event)',
  'var(--color-kind-industry-job)',
  'var(--color-kind-skill-training)',
] as const;

const CHARACTER_DASHES = [undefined, '6 3', '2 3'] as const;

export function characterStroke(index: number): { color: string; dash: string | undefined } {
  return {
    color: CHARACTER_COLORS[index % CHARACTER_COLORS.length]!,
    dash: CHARACTER_DASHES[Math.floor(index / CHARACTER_COLORS.length) % CHARACTER_DASHES.length],
  };
}
