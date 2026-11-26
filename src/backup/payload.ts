import type { CharacterRecord, SettingRecord, TokenRecord } from '@/db';

export interface EditableRow {
  characterId: number;
  [key: string]: unknown;
}

export interface BackupPayload {
  characters: CharacterRecord[];
  tokens: TokenRecord[];
  editableTables: Record<string, EditableRow[]>;
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
  toWrite: BackupPayload;
  skippedCharacterIds: number[];
  skippedSettingKeys: string[];
}

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
