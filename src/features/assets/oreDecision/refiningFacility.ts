import { createSyncedSetting } from '@/lib/useSyncedSetting';

export const ORE_REFINING_STRUCTURE_RATE_KEY = 'sync.oreRefiningStructureRate';

export const useOreRefiningStructureRate = createSyncedSetting<number>({
  key: ORE_REFINING_STRUCTURE_RATE_KEY,
  defaultValue: 0,
  parse: (raw) => (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : null),
});
