import { salesTaxPct } from '@/engine/industry/fees';
import { HAULING_THRESHOLDS, type HaulingThresholds } from './haulingMarket';

export const ROUGH_FEE_FACTOR = 0.94;
export const INSTANT_ROUGH_FEE_FACTOR = 1 - salesTaxPct(5) / 100;

function score(unitProfit: number, units: number): number {
  return unitProfit <= 0 ? unitProfit : unitProfit * units;
}

export interface PriceScoreInput {
  buy: number;
  sell: number;
  originListed: number;
  destListed: number;
}

export function priceScore(
  { buy, sell, originListed, destListed }: PriceScoreInput,
  feeFactor: number = ROUGH_FEE_FACTOR
): number {
  return score(sell * feeFactor - buy, Math.min(originListed, destListed));
}

export interface HistoryScoreInput {
  buy: number;
  recentSalePrice: number;
  dailyVolume: number;
  originListed: number;
}

export function historyScore(
  { buy, recentSalePrice, dailyVolume, originListed }: HistoryScoreInput,
  thresholds: HaulingThresholds = HAULING_THRESHOLDS
): number {
  const lot = Math.floor(dailyVolume * thresholds.horizonDays * thresholds.ownShareOfDemand);
  return score(recentSalePrice * ROUGH_FEE_FACTOR - buy, Math.min(lot, originListed));
}
