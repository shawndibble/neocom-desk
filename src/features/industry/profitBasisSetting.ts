/**
 * How a Build Plan counts the materials the pilot already owns: as free (the
 * ISK actually leaving the wallet) or at what they would sell for (the
 * opportunity cost of using them). One preference for the Build Plans list and
 * the plan page, so a plan's profit reads the same on both.
 *
 * Opportunity cost by default: it is the figure that answers "should I build
 * this, or sell what I hold?". Device-local, a way of reading the numbers like
 * a sort, not a fact about how the pilot plays.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import type { ProfitBasis } from '@/engine/industry/profitBasis';

export const PROFIT_BASIS_SETTING_KEY = 'industryProfitBasis';
export const DEFAULT_PROFIT_BASIS: ProfitBasis = 'sellValue';

export const useProfitBasis = createLocalSetting<ProfitBasis>({
  key: PROFIT_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_PROFIT_BASIS,
  parse: (raw) => (raw === 'free' || raw === 'sellValue' ? raw : null),
});
