import { createLocalSetting } from '@/lib/useLocalSetting';
import { DEFAULT_BUYBACK_RATE, isValidBuybackRate } from '@/engine/miningTax/buybackRate';

export const MINING_BUYBACK_RATE_KEY = 'miningYieldBuybackRate';

export const useMiningBuybackRate = createLocalSetting<number>({
  key: MINING_BUYBACK_RATE_KEY,
  defaultValue: DEFAULT_BUYBACK_RATE,
  parse: (raw) => (typeof raw === 'number' && isValidBuybackRate(raw) ? raw : null),
});
