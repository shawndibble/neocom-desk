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
] as const;

export type CharacterColumnId = (typeof CHARACTER_COLUMN_IDS)[number];

/** Shown before anyone touches the column picker — the "needs my attention" signals, not the identity/economy stats the card view (and Overview) already cover. */
export const DEFAULT_VISIBLE_CHARACTER_COLUMNS: readonly CharacterColumnId[] = [
  'name',
  'training',
  'openJobsManufacturing',
  'openJobsScience',
  'openJobsReaction',
  'pi',
  'alerts',
  'lastSynced',
  'starred',
];

function isCharacterColumnId(raw: unknown): raw is CharacterColumnId {
  return typeof raw === 'string' && (CHARACTER_COLUMN_IDS as readonly string[]).includes(raw);
}

export const VISIBLE_CHARACTER_COLUMNS_KEY = 'charactersVisibleColumns';

export const useVisibleCharacterColumns = createLocalSetting<readonly CharacterColumnId[]>({
  key: VISIBLE_CHARACTER_COLUMNS_KEY,
  defaultValue: DEFAULT_VISIBLE_CHARACTER_COLUMNS,
  // An empty stored array is rejected rather than honoured (miningTax's
  // statusFilterPref.ts precedent) — it would render a table with only the
  // row header, no columns and no explanation.
  parse: (raw) =>
    Array.isArray(raw) && raw.length > 0 && raw.every(isCharacterColumnId)
      ? (raw as CharacterColumnId[])
      : null,
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
 * every row as unknown, which is worse than not offering it.
 */
export function availableCharacterColumns(
  spExtractionEnabled: boolean
): readonly CharacterColumnId[] {
  return spExtractionEnabled
    ? CHARACTER_COLUMN_IDS
    : CHARACTER_COLUMN_IDS.filter((id) => id !== 'spReady');
}

/**
 * The stored preference, narrowed to what's actually offered right now — so
 * a column picked while monitoring was on doesn't linger in the table after
 * the pilot turns it back off (the stored preference itself is untouched;
 * turning monitoring on again brings the column straight back).
 */
export function visibleAvailableColumns(
  visible: readonly CharacterColumnId[],
  spExtractionEnabled: boolean
): readonly CharacterColumnId[] {
  const available = new Set(availableCharacterColumns(spExtractionEnabled));
  return visible.filter((id) => available.has(id));
}
