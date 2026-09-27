/**
 * Whether BPC Sourcing opens with its two exclude toggles on (issue #1105):
 * "Auctions" hides auction-type contract rows, "PLEX contracts" hides
 * contracts that ask for PLEX in return.
 *
 * A pilot who never bids on an auction or takes a PLEX barter re-ticked both
 * on every visit. These are only the *starting* state: the toggles in the
 * filter bar still flip either for the current view, and the URL wins over
 * the default (ADR 0015 — nothing writes back to the stored setting from
 * there). Default off, unchanged from before.
 *
 * Synced (`sync.bpcHideAuctions`, `sync.bpcHidePlex`): a fact about which
 * contracts the pilot will consider, not about one machine.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const BPC_HIDE_AUCTIONS_SETTING_KEY = 'sync.bpcHideAuctions';
export const BPC_HIDE_PLEX_SETTING_KEY = 'sync.bpcHidePlex';

const parseBoolean = (raw: unknown): boolean | null => (typeof raw === 'boolean' ? raw : null);

export const useBpcHideAuctionsDefault = createSyncedSetting<boolean>({
  key: BPC_HIDE_AUCTIONS_SETTING_KEY,
  defaultValue: false,
  parse: parseBoolean,
});

export const useBpcHidePlexDefault = createSyncedSetting<boolean>({
  key: BPC_HIDE_PLEX_SETTING_KEY,
  defaultValue: false,
  parse: parseBoolean,
});
