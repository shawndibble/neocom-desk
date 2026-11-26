import { createColumnVisibilitySetting } from '@/lib/columnVisibility';
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CHARACTER_COLUMN_IDS = [
  'name',
  'achievement',
  'corp',
  'dockedAt',
  'ship',
  'group',
  'spTotal',
  'wallet',
  'netWorth',
  'lastSynced',
  'training',
  'accelerator',
  'openJobsManufacturing',
  'openJobsScience',
  'openJobsReaction',
  'pi',
  'spFarm',
  'spReady',
  'alerts',
  'corpRoles',
  'corpAccess',
  'alertsWhenClosed',
  'starred',
] as const;

export type CharacterColumnId = (typeof CHARACTER_COLUMN_IDS)[number];

export const DEFAULT_VISIBLE_CHARACTER_COLUMNS: readonly CharacterColumnId[] = [
  'name',
  'group',
  'wallet',
  'training',
  'openJobsManufacturing',
  'openJobsScience',
  'openJobsReaction',
  'pi',
  'alerts',
  'lastSynced',
  'starred',
];

export const VISIBLE_CHARACTER_COLUMNS_KEY = 'charactersVisibleColumns';

export const useVisibleCharacterColumns = createColumnVisibilitySetting({
  key: VISIBLE_CHARACTER_COLUMNS_KEY,
  ids: CHARACTER_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_CHARACTER_COLUMNS,
  retired: ['remove'],
});

export function migrateVisibleColumns(
  stored: readonly CharacterColumnId[]
): readonly CharacterColumnId[] {
  return stored.includes('group') ? stored : [...stored, 'group'];
}

export const CHARACTER_COLUMNS_MIGRATED_KEY = 'charactersColumnsMigratedGroupRemove';

export const useCharacterColumnsMigrated = createLocalSetting<boolean>({
  key: CHARACTER_COLUMNS_MIGRATED_KEY,
  defaultValue: false,
});

export type CharacterViewMode = 'card' | 'table';

export const CHARACTER_VIEW_MODE_KEY = 'charactersViewMode';

function isCharacterViewMode(raw: unknown): raw is CharacterViewMode {
  return raw === 'card' || raw === 'table';
}

export const useCharacterViewMode = createLocalSetting<CharacterViewMode>({
  key: CHARACTER_VIEW_MODE_KEY,
  defaultValue: 'card',
  parse: (raw) => (isCharacterViewMode(raw) ? raw : null),
});

export function availableCharacterColumns(
  spExtractionEnabled: boolean,
  hasGroups: boolean,
  syncConfigured = true
): readonly CharacterColumnId[] {
  return CHARACTER_COLUMN_IDS.filter((id) => {
    if (id === 'spReady' || id === 'spFarm') return spExtractionEnabled;
    if (id === 'group') return hasGroups;
    if (id === 'alertsWhenClosed') return syncConfigured;
    return true;
  });
}

export function visibleAvailableColumns(
  visible: readonly CharacterColumnId[],
  spExtractionEnabled: boolean,
  hasGroups: boolean,
  syncConfigured = true
): readonly CharacterColumnId[] {
  const available = new Set(
    availableCharacterColumns(spExtractionEnabled, hasGroups, syncConfigured)
  );
  return visible.filter((id) => available.has(id));
}
