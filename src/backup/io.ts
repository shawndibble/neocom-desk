import type { Table } from 'dexie';
import { db } from '@/db';
import { downloadTextFile } from '@/lib/download';
import { EDITABLE_COLLECTIONS } from '@/sync/syncedCollections';
import { isAllowedSyncedSettingKey } from '@/sync/syncedSettings';
import { encryptExportPayload, decryptExportPayload, type BackupFile } from './crypto';
import {
  buildBackupPayload,
  partitionImport,
  type BackupPayload,
  type EditableRow,
} from './payload';
import { utcDay } from '@/engine/localDay';
import { OVERVIEW_GROUPS_SETTING_KEY } from '@/features/character/overviewGroups';

const EDITABLE_TABLES: readonly string[] = EDITABLE_COLLECTIONS.map((c) => c.table);

function editableTable(name: string): Table<EditableRow, unknown> {
  return db.table<EditableRow, unknown>(name);
}

async function readEditableTables(): Promise<Record<string, EditableRow[]>> {
  const entries = await Promise.all(
    EDITABLE_TABLES.map(async (table) => [table, await editableTable(table).toArray()] as const)
  );
  return Object.fromEntries(entries);
}

async function writeEditableTables(editableTables: Record<string, EditableRow[]>): Promise<void> {
  for (const table of EDITABLE_TABLES) {
    const rows = editableTables[table];
    if (!rows?.length) continue;
    const target = editableTable(table);
    const held = await target.bulkGet(rows.map((r) => r.id));
    const fresh = rows.filter((_, i) => held[i] === undefined);
    if (fresh.length) await target.bulkAdd(fresh);
  }
}

function isBackedUpSetting(s: { key: string }): boolean {
  return isAllowedSyncedSettingKey(s.key) || s.key === OVERVIEW_GROUPS_SETTING_KEY;
}

export async function exportBackup(
  password: string
): Promise<{ filename: string; contents: string }> {
  const [characters, tokens, editableTables, allSettings] = await Promise.all([
    db.characters.toArray(),
    db.tokens.toArray(),
    readEditableTables(),
    db.settings.toArray(),
  ]);
  const settings = allSettings.filter(isBackedUpSetting);
  const payload: BackupPayload = buildBackupPayload(characters, tokens, editableTables, settings);
  const file = await encryptExportPayload(payload, password);
  const filename = `neocom-desk-backup-${utcDay()}.json`;
  return { filename, contents: JSON.stringify(file, null, 2) };
}

export async function exportBackupToFile(password: string): Promise<void> {
  const { filename, contents } = await exportBackup(password);
  downloadTextFile(filename, contents, 'application/json');
}

export interface ImportSummary {
  addedCharacterIds: number[];
  skippedCharacterIds: number[];
  addedSettingKeys: string[];
  skippedSettingKeys: string[];
}

function isBackupFile(value: unknown): value is BackupFile {
  return (
    !!value &&
    typeof value === 'object' &&
    (value as { app?: unknown }).app === 'neocom-desk-backup'
  );
}

export async function importBackup(fileContents: string, password: string): Promise<ImportSummary> {
  const parsed: unknown = JSON.parse(fileContents);
  if (!isBackupFile(parsed)) {
    throw new Error('Not a Neocom Desk backup file');
  }
  const payload = (await decryptExportPayload(parsed, password)) as BackupPayload;

  return db.transaction(
    'rw',
    [db.characters, db.tokens, db.settings, ...EDITABLE_TABLES.map(editableTable)],
    async () => {
      const [existingCharacters, existingSettings] = await Promise.all([
        db.characters.toArray(),
        db.settings.toArray(),
      ]);
      const existingCharacterIds = new Set(existingCharacters.map((c) => c.characterId));
      const existingSettingKeys = new Set(existingSettings.map((s) => s.key));

      const { toWrite, skippedCharacterIds, skippedSettingKeys } = partitionImport(
        payload,
        existingCharacterIds,
        existingSettingKeys
      );

      if (toWrite.characters.length) await db.characters.bulkAdd(toWrite.characters);
      if (toWrite.tokens.length) await db.tokens.bulkAdd(toWrite.tokens);
      await writeEditableTables(toWrite.editableTables);
      if (toWrite.settings.length) await db.settings.bulkAdd(toWrite.settings);

      return {
        addedCharacterIds: toWrite.characters.map((c) => c.characterId),
        skippedCharacterIds,
        addedSettingKeys: toWrite.settings.map((s) => s.key),
        skippedSettingKeys,
      };
    }
  );
}
