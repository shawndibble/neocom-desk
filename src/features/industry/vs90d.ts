/** Shared text for the "vs 90d" figure: its header explanation and the phone cards' readout. */
import type { TFunction } from 'i18next';
import {
  isPriceSpike,
  PRICE_SPIKE_PCT,
  VS_MEDIAN_MIN_TRADED_DAYS,
  VS_MEDIAN_WINDOW_DAYS,
} from '@/engine/market/priceVsMedian';
import { formatVsMedianPct } from '@/features/market/format';

/** The "vs 90d" header's explanation, with the thresholds the figure is held to. */
export function vs90dTooltip(t: TFunction): string {
  return t('industry.vs90dTooltip', {
    windowDays: VS_MEDIAN_WINDOW_DAYS,
    spikePct: PRICE_SPIKE_PCT,
    minDays: VS_MEDIAN_MIN_TRADED_DAYS,
  });
}

/**
 * The phone cards' "vs 90d" readout: the figure and its tone, "…" while still
 * being read, or null when blank — a card leaves a blank readout out.
 */
export function vs90dReadout(
  value: number | null | undefined
): { node: string; toneClassName?: string } | null {
  if (value === undefined) return { node: '…', toneClassName: 'text-text-dim' };
  if (value === null) return null;
  return {
    node: formatVsMedianPct(value),
    toneClassName: isPriceSpike(value) ? 'text-warning' : undefined,
  };
}
