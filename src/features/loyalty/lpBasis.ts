import { createLocalSetting } from '@/lib/useLocalSetting';

export type LpBasis = 'lp' | 'concord';

export const LP_BASIS_SETTING_KEY = 'loyaltyStoreLpBasis';

export const DEFAULT_LP_BASIS: LpBasis = 'lp';

export const useLpBasis = createLocalSetting<LpBasis>({
  key: LP_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_LP_BASIS,
  parse: (raw) => (raw === 'lp' || raw === 'concord' ? raw : null),
});
