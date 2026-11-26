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

export const NPC_STANDINGS_DEFAULT_COLUMNS: readonly NpcStandingsColumnId[] =
  NPC_STANDINGS_COLUMN_IDS.filter((id) => id !== 'standing');

export const npcStandingsColumnsStore = createColumnVisibilitySetting({
  key: 'npcStandingsVisibleColumns',
  ids: NPC_STANDINGS_COLUMN_IDS,
  defaultVisible: NPC_STANDINGS_DEFAULT_COLUMNS,
});
