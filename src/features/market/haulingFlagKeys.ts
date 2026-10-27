import type { HaulingFlag } from '@/engine/market/haulingMarket';

/** Each flag's `market.hauling.flags` key; its tooltip is the same key plus `Tip`. */
export const HAULING_FLAG_KEY: Record<HaulingFlag, 'thin' | 'crowded' | 'outlier' | 'lowMargin'> = {
  thin: 'thin',
  crowded: 'crowded',
  outlier: 'outlier',
  'low-margin': 'lowMargin',
};
