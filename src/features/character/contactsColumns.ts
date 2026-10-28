/**
 * Contacts route — optional-column catalogs and device-local visible-columns
 * preferences for its three tables ("This character", "Across characters",
 * "Standings"), the `createColumnVisibilitySetting` pattern
 * (`src/lib/columnVisibility.ts`).
 * Each table's `name` column is its identity and never appears here.
 */
import { createColumnVisibilitySetting } from '@/lib/columnVisibility';

export const CONTACTS_CHARACTER_COLUMN_IDS = [
  'type',
  'affiliation',
  'achievement',
  'labels',
  'standing',
  'flags',
] as const;
export type ContactsCharacterColumnId = (typeof CONTACTS_CHARACTER_COLUMN_IDS)[number];

/**
 * Every column but Title / Score (issue #4777): it costs one public-record
 * read per Character contact, so it shows only once picked.
 */
export const DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS: readonly ContactsCharacterColumnId[] =
  CONTACTS_CHARACTER_COLUMN_IDS.filter((id) => id !== 'achievement');

export const contactsCharacterColumnsStore = createColumnVisibilitySetting({
  key: 'contactsCharacterVisibleColumns',
  ids: CONTACTS_CHARACTER_COLUMN_IDS,
  defaultVisible: DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS,
});

export const CONTACTS_ACROSS_COLUMN_IDS = ['type', 'held', 'standings'] as const;
export type ContactsAcrossColumnId = (typeof CONTACTS_ACROSS_COLUMN_IDS)[number];

export const contactsAcrossColumnsStore = createColumnVisibilitySetting({
  key: 'contactsAcrossVisibleColumns',
  ids: CONTACTS_ACROSS_COLUMN_IDS,
});

export const NPC_STANDINGS_COLUMN_IDS = [
  'kind',
  'belongsTo',
  'effective',
  'standing',
  'access',
  'jumps',
  'fees',
] as const;
export type NpcStandingsColumnId = (typeof NPC_STANDINGS_COLUMN_IDS)[number];

/**
 * Standing (with skills) is the number the game shows and uses; Base is ESI's
 * figure, which only broker fees read, so it starts off (it is shown anyway
 * when the skills could not be read and Standing has nothing to say).
 */
export const NPC_STANDINGS_DEFAULT_COLUMNS: readonly NpcStandingsColumnId[] =
  NPC_STANDINGS_COLUMN_IDS.filter((id) => id !== 'standing');

export const npcStandingsColumnsStore = createColumnVisibilitySetting({
  key: 'npcStandingsVisibleColumns',
  ids: NPC_STANDINGS_COLUMN_IDS,
  defaultVisible: NPC_STANDINGS_DEFAULT_COLUMNS,
});
