import type { TFunction } from 'i18next';
import {
  isPriceSpike,
  PRICE_SPIKE_PCT,
  VS_MEDIAN_MIN_TRADED_DAYS,
  VS_MEDIAN_WINDOW_DAYS,
} from '@/engine/market/priceVsMedian';
import { formatVsMedianPct } from '@/features/market/format';

export function vs90dTooltip(t: TFunction): string {
  return t('industry.vs90dTooltip', {
    windowDays: VS_MEDIAN_WINDOW_DAYS,
    spikePct: PRICE_SPIKE_PCT,
    minDays: VS_MEDIAN_MIN_TRADED_DAYS,
  });
}

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
