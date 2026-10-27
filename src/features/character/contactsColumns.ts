/**
 * Contacts route — optional-column catalogs and device-local visible-columns
 * preferences for its two tables ("This character", "Across characters"), the
 * `createColumnVisibilitySetting` pattern (`src/lib/columnVisibility.ts`).
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
