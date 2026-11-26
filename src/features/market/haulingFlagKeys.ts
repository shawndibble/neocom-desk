import type { HaulingFlag } from '@/engine/market/haulingMarket';

export const HAULING_FLAG_KEY: Record<HaulingFlag, 'thin' | 'crowded' | 'outlier' | 'lowMargin'> = {
  thin: 'thin',
  crowded: 'crowded',
  outlier: 'outlier',
  'low-margin': 'lowMargin',
};
