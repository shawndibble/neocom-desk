/**
 * How many times the hub sell an item contract may ask before the Items board
 * flags it (issue #4773, `engine/contracts/contractFlags.ts`).
 *
 * Settable because "far above market" is a judgement: a buyer who only wants
 * the outright traps wants 20x, one hunting fair deals wants 5x. Presets
 * rather than a free number, so the tooltip and the detail sentence can always
 * name the multiple. Default 10, Market Browser's bait factor. A blueprint
 * copy is flagged against its original's price whatever this says.
 *
 * Synced (`sync.itemContractFlagMultiple`): it describes the pilot's own
 * appetite for a markup, not the screen they are on.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';
import { DEFAULT_ITEM_FLAG_MULTIPLE } from '@/engine/contracts/contractFlags';

export const ITEM_FLAG_MULTIPLE_SETTING_KEY = 'sync.itemContractFlagMultiple';

export const ITEM_FLAG_MULTIPLE_OPTIONS: readonly number[] = [5, 10, 20, 50];

export const useItemFlagMultiple = createSyncedSetting<number>({
  key: ITEM_FLAG_MULTIPLE_SETTING_KEY,
  defaultValue: DEFAULT_ITEM_FLAG_MULTIPLE,
  // Restricted to the presets: a value from a build with a different list
  // falls back to the default rather than flag by a multiple the copy cannot name.
  parse: (raw) =>
    typeof raw === 'number' && ITEM_FLAG_MULTIPLE_OPTIONS.includes(raw) ? raw : null,
});
