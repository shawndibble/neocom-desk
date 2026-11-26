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
