/**
 * Device-local: which price basis the Mining Yield Overview values days on
 * (issue #1279). Silent page state, like the date range — the Value button
 * shows it. Every basis is precomputed in the snapshot, so none costs more.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { PRICE_BASES, type PriceBasis } from '@/engine/miningTax/priceBasis';

export const MINING_PRICE_BASIS_KEY = 'miningYieldPriceBasis';

export const DEFAULT_MINING_PRICE_BASIS: PriceBasis = 'buy';

function isPriceBasis(raw: unknown): raw is PriceBasis {
  return PRICE_BASES.includes(raw as PriceBasis);
}

export const useMiningPriceBasis = createLocalSetting<PriceBasis>({
  key: MINING_PRICE_BASIS_KEY,
  defaultValue: DEFAULT_MINING_PRICE_BASIS,
  parse: (raw) => (isPriceBasis(raw) ? raw : null),
});
