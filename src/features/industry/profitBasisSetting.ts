import { createLocalSetting } from '@/lib/useLocalSetting';
import type { ProfitBasis } from '@/engine/industry/profitBasis';

export const PROFIT_BASIS_SETTING_KEY = 'industryProfitBasis';
export const DEFAULT_PROFIT_BASIS: ProfitBasis = 'sellValue';

export const useProfitBasis = createLocalSetting<ProfitBasis>({
  key: PROFIT_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_PROFIT_BASIS,
  parse: (raw) => (raw === 'free' || raw === 'sellValue' ? raw : null),
});
