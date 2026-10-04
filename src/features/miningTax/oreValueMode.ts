/**
 * "Edit ore values individually" (grilling session, 2026-09-27): whether the
 * Moon Mining Tax edit form (`EntryEditDialog.tsx`) shows one editable
 * total-value box per ore type instead of one value per day. Off by default.
 *
 * Synced, not device-local: a pilot reconciling this app's numbers against a
 * corp's own moon-tax tool wants that per-ore workflow available wherever
 * they're doing the reconciling, not re-enabled per device — same reasoning
 * as `features/character/spExtractionSettings.ts`.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const MINING_TAX_ORE_VALUE_MODE_KEY = 'sync.miningTaxOreValueMode';

export const useMiningTaxOreValueMode = createSyncedSetting<boolean>({
  key: MINING_TAX_ORE_VALUE_MODE_KEY,
  defaultValue: false,
});
