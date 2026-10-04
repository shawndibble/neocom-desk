/**
 * The Characters table view's column catalog and the two device-local
 * preferences behind it (grilling session, 2026-09-09): which view — card or
 * table — and, in table view, which columns show.
 *
 * Both device-local, deliberately: a phone and a desktop reasonably want
 * different columns (screen width) and even a different default view, unlike
 * the SP extraction settings (`spExtractionSettings.ts`), which sync because
 * they're a judgement call about the pilot, not the screen.
 */
import { createLocalSetting } from '@/lib/useLocalSetting';

export const CHARACTER_COLUMN_IDS = [
  'name',
  'corp',
  'group',
  'spTotal',
  'wallet',
  'lastSynced',
  'training',
  'openJobsManufacturing',
  'openJobsScience',
  'openJobsReaction',
  'pi',
  'spReady',
  'alerts',
  // Last, always — CONTEXT.md's glossary reserves "pinned" for a planetary
  // structure, so this is `starred` internally (same feature the card view's
  // star toggle already drives), header text says "Starred".
  'starred',
  // Truly last: a destructive action reads worst leading, same reasoning as
  // the card's separate red X sitting after its group Select (issue #2077).
  'remove',
] as const;

export type CharacterColumnId = (typeof CHARACTER_COLUMN_IDS)[number];

/** Shown before anyone touches the column picker — the "needs my attention" signals, not the identity/economy stats the card view (and Overview) already cover. */
export const DEFAULT_VISIBLE_CHARACTER_COLUMNS: readonly CharacterColumnId[] = [
  'name',
  'group',
  'training',
  'openJobsManufacturing',
  'openJobsScience',
  'openJobsReaction',
  'pi',
  'alerts',
  'lastSynced',
  'starred',
  'remove',
];

function isCharacterColumnId(raw: unknown): raw is CharacterColumnId {
  return typeof raw === 'string' && (CHARACTER_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_CHARACTER_COLUMNS_KEY = 'charactersVisibleColumns';

export const useVisibleCharacterColumns = createLocalSetting<readonly CharacterColumnId[]>({
  key: VISIBLE_CHARACTER_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_CHARACTER_COLUMNS,
  // An empty stored array is rejected rather than honoured (miningTax's
  // since-retired statusFilterPref.ts precedent) — it would render a table with only the
  // row header, no columns and no explanation.
  parse: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every(isCharacterColumnId)
      ? (raw as CharacterColumnId[])
      : null,
});

/**
 * `group`/`remove` shipped after `charactersVisibleColumns` was already in
 * use on real devices (issue #2077), so a stored preference from before this
 * change is missing both ids — not because a pilot hid them, since they
 * didn't exist yet to hide. Appends whichever of the two is missing, in the
 * catalog's own order; a no-op once both are already present.
 *
 * This function alone can't tell "never had it" from "pilot deliberately hid
 * it after the migration already ran" — calling it on every hydrate would
 * undo that hide. The caller is responsible for calling it exactly once per
 * device, gated by `charactersColumnsMigratedGroupRemove`
 * (`useCharacterColumnsMigrated`), not on every hydrate.
 */
export function migrateVisibleColumns(
  stored: readonly CharacterColumnId[]
): readonly CharacterColumnId[] {
  const missing = (['group', 'remove'] as const).filter((id) => !stored.includes(id));
  return missing.length === 0 ? stored : [...stored, ...missing];
}

export const CHARACTER_COLUMNS_MIGRATED_KEY = 'charactersColumnsMigratedGroupRemove';

/** One-shot flag: true once `migrateVisibleColumns` has run against the stored preference on this device. */
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

/**
 * `spReady` only when the pilot has opted into SP extraction monitoring
 * (`spExtractionSettings.ts`) — a column for a feature that's off would show
 * every row as unknown, which is worse than not offering it. `group`
 * likewise only when at least one Group exists — with none, the column's
 * Select would offer only "Ungrouped" for every row, same reasoning as the
 * card view's own `groups.length > 0` gate on its Select.
 */
export function availableCharacterColumns(
  spExtractionEnabled: boolean,
  hasGroups: boolean
): readonly CharacterColumnId[] {
  return CHARACTER_COLUMN_IDS.filter((id) => {
    if (id === 'spReady') return spExtractionEnabled;
    if (id === 'group') return hasGroups;
    return true;
  });
}

/**
 * The stored preference, narrowed to what's actually offered right now — so
 * a column picked while monitoring was on (or Groups existed) doesn't linger
 * in the table after the pilot turns it back off or deletes their last group
 * (the stored preference itself is untouched; turning monitoring back on, or
 * adding a group again, brings the column straight back).
 */
export function visibleAvailableColumns(
  visible: readonly CharacterColumnId[],
  spExtractionEnabled: boolean,
  hasGroups: boolean
): readonly CharacterColumnId[] {
  const available = new Set(availableCharacterColumns(spExtractionEnabled, hasGroups));
  return visible.filter((id) => available.has(id));
}
