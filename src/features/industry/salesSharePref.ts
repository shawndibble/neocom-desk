/**
 * Market-Wide Opportunities' "share of daily sales" assumption (ISK/day's
 * volume cap), remembered across visits. A stored default behind the
 * `marketWide.share` URL key (decision `20260922-221531`, ADR 0015): a link's
 * value wins for that view and is never written here; only an edit stores it.
 * Device-local, the filter bar's own state.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';
import { DEFAULT_SALES_SHARE_PCT, SALES_SHARE_PCTS } from '@/engine/industry/iskPerDay';

export const SALES_SHARE_SETTING_KEY = 'marketWideSalesShare';

/** The URL/stored form: the percent as a string, e.g. `'10'`. */
export const SALES_SHARE_OPTIONS = SALES_SHARE_PCTS.map(String);
export const DEFAULT_SALES_SHARE = String(DEFAULT_SALES_SHARE_PCT);

export const useSalesShare = createLocalSetting<string>({
  key: SALES_SHARE_SETTING_KEY,
  defaultValue: DEFAULT_SALES_SHARE,
  parse: (raw) => (typeof raw === 'string' && SALES_SHARE_OPTIONS.includes(raw) ? raw : null),
});
