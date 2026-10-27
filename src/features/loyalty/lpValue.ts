/**
 * The pilot's own **LP Value** (issue #1240): what they count one loyalty
 * point as worth, in ISK, for every store's LP. Default 0, which means "use
 * each store's market rate" (`marketLpValue.ts`, resolved by `lpRate`).
 *
 * Synced (`sync.loyaltyLpValue`): the rate someone cashes out LP at is a fact
 * about how they play, not about one machine — same reasoning as
 * `features/industry/assumedMe.ts`.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const LP_VALUE_SETTING_KEY = 'sync.loyaltyLpValue';

export const DEFAULT_LP_VALUE = 0;

export const useLpValue = createSyncedSetting<number>({
  key: LP_VALUE_SETTING_KEY,
  defaultValue: DEFAULT_LP_VALUE,
  // Pulled from another device, possibly an older build — only a finite,
  // non-negative rate may price an offer.
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null),
});
