// Backup payload shape and import conflict resolution (issue #789). Pure —
// takes already-read Dexie rows in, returns rows out; no Dexie import here.
// `io.ts` is the thin boundary that actually reads/writes `db`.

import type { CharacterRecord, SettingRecord, TokenRecord } from '@/db';

/** A row from one of the Editable Data tables in `REMOTE_COLLECTIONS` (`sync/characterPurge.ts`) that carries `characterId`. */
export interface EditableRow {
  characterId: number;
  [key: string]: unknown;
}

/** One export/import bundle: every Character on the device, its token, its Editable Data, and its synced settings. */
export interface BackupPayload {
  characters: CharacterRecord[];
  tokens: TokenRecord[];
  /** Dexie table name -> rows, for every table in `REMOTE_COLLECTIONS`. */
  editableTables: Record<string, EditableRow[]>;
  /** Only rows whose key passes `isAllowedSyncedSettingKey` (`sync/syncedSettings.ts`). */
  settings: SettingRecord[];
}

export function buildBackupPayload(
  characters: CharacterRecord[],
  tokens: TokenRecord[],
  editableTables: Record<string, EditableRow[]>,
  settings: SettingRecord[]
): BackupPayload {
  return { characters, tokens, editableTables, settings };
}

export interface PartitionResult {
  /** Only the rows for characters/settings not already present locally — what import should actually write. */
  toWrite: BackupPayload;
  skippedCharacterIds: number[];
  skippedSettingKeys: string[];
}

/**
 * Conflict policy (issue #789, "decided, do not relitigate"): partition by
 * `characterId` — a Character already present locally is skipped entirely
 * (token untouched, no merge); a new Character is written wholesale.
 * `sync.`-prefixed settings follow the same skip-if-present rule,
 * independently of Character partitioning.
 */
export function partitionImport(
  payload: BackupPayload,
  existingCharacterIds: ReadonlySet<number>,
  existingSettingKeys: ReadonlySet<string>
): PartitionResult {
  const newCharacters = payload.characters.filter((c) => !existingCharacterIds.has(c.characterId));
  const skippedCharacterIds = payload.characters
    .filter((c) => existingCharacterIds.has(c.characterId))
    .map((c) => c.characterId);
  const keepCharacterIds = new Set(newCharacters.map((c) => c.characterId));

  const tokens = payload.tokens.filter((t) => keepCharacterIds.has(t.characterId));

  const editableTables: Record<string, EditableRow[]> = {};
  for (const [table, rows] of Object.entries(payload.editableTables)) {
    editableTables[table] = rows.filter((row) => keepCharacterIds.has(row.characterId));
  }

  const settings = payload.settings.filter((s) => !existingSettingKeys.has(s.key));
  const skippedSettingKeys = payload.settings
    .filter((s) => existingSettingKeys.has(s.key))
    .map((s) => s.key);

  return {
    toWrite: { characters: newCharacters, tokens, editableTables, settings },
    skippedCharacterIds,
    skippedSettingKeys,
  };
}
