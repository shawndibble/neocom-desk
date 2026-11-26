import { createLocalSetting } from '@/lib/useLocalSetting';
import { DEFAULT_SALES_SHARE_PCT, SALES_SHARE_PCTS } from '@/engine/industry/iskPerDay';

const SALES_SHARE_SETTING_KEY = 'marketWideSalesShare';

export const SALES_SHARE_OPTIONS = SALES_SHARE_PCTS.map(String);
export const DEFAULT_SALES_SHARE = String(DEFAULT_SALES_SHARE_PCT);

export const useSalesShare = createLocalSetting<string>({
  key: SALES_SHARE_SETTING_KEY,
  defaultValue: DEFAULT_SALES_SHARE,
  parse: (raw) => (typeof raw === 'string' && SALES_SHARE_OPTIONS.includes(raw) ? raw : null),
});
