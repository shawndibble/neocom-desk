/**
 * The pilot's **LP Value** (issue #1240): what they count one loyalty point
 * as worth, in ISK. Prices an LP Store pick in the Blueprint Acquisition
 * modal as ISK cost + LP cost × this rate. Default 0 — ISK cost alone —
 * because the app has no honest single number for what an LP is worth; the
 * pilot types their own and it is kept from then on.
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
