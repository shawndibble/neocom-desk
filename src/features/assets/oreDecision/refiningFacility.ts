/**
 * The refining facility a pilot assumes in the "What to do with this ore"
 * dialog (issue #2836). ESI cannot read a structure's refining rate, so the
 * pilot types it for 'My structure'; 0 (the default) means an NPC station at
 * the 50% base. Synced: it is player-entered data.
 */
import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const ORE_REFINING_STRUCTURE_RATE_KEY = 'sync.oreRefiningStructureRate';

/** A fraction (0.54 = 54%); 0 = NPC station. */
export const useOreRefiningStructureRate = createSyncedSetting<number>({
  key: ORE_REFINING_STRUCTURE_RATE_KEY,
  defaultValue: 0,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null),
});
