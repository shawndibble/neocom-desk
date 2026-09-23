/**
 * Device-local: the Mining Yield Overview's buyback rate (issue #1280). Page
 * state like the date range and price basis — the Value button shows it.
 * Local, not synced: unlike the Appraisal tab's `pricePercent`, this is a
 * setting about the corp buyback the pilot happens to sell into on this
 * machine, not a fact about the pilot that should follow them everywhere.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { DEFAULT_BUYBACK_RATE, isValidBuybackRate } from '@/engine/miningTax/buybackRate';

export const MINING_BUYBACK_RATE_KEY = 'miningYieldBuybackRate';

export const useMiningBuybackRate = createLocalSetting<number>({
  key: MINING_BUYBACK_RATE_KEY,
  defaultValue: DEFAULT_BUYBACK_RATE,
  parse: (raw) => (typeof raw === 'number' && isValidBuybackRate(raw) ? raw : null),
});
