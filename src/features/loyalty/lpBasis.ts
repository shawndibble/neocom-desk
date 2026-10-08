/**
 * What the LP Store's ISK-per-LP figure is per: the offer's own corporation LP
 * (the default and today's behaviour) or CONCORD LP, converted at the
 * corporation's exchange rate (`engine/loyalty/concordExchange.ts`). Only the
 * displayed figure and its sort change; the offer's profit does not.
 *
 * A device-local UI preference like `priceBasis.ts`, never synced (CONTEXT.md).
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export type LpBasis = 'lp' | 'concord';

export const LP_BASIS_SETTING_KEY = 'loyaltyStoreLpBasis';

export const DEFAULT_LP_BASIS: LpBasis = 'lp';

export const useLpBasis = createLocalSetting<LpBasis>({
  key: LP_BASIS_SETTING_KEY,
  defaultValue: DEFAULT_LP_BASIS,
  parse: (raw) => (raw === 'lp' || raw === 'concord' ? raw : null),
});
