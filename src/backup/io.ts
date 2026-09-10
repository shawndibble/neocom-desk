// The Dexie boundary for encrypted export/import (issue #789). Wires the pure
// `crypto.ts`/`payload.ts` modules to `db` — the only file in this feature
// that reads or writes IndexedDB.

import type { Table } from 'dexie';
import { db } from '@/db';
import { downloadTextFile } from '@/lib/download';
import { isAllowedSyncedSettingKey } from '@/sync/syncedSettings';
import { encryptExportPayload, decryptExportPayload, type BackupFile } from './crypto';
import {
  buildBackupPayload,
  partitionImport,
  type BackupPayload,
  type EditableRow,
} from './payload';

/**
 * Dexie table names for every Editable Data table a Character owns
 * (`sync/characterPurge.ts`'s `REMOTE_COLLECTIONS`, minus `settings` and
 * `notificationFeed` — settings are handled separately below by their
 * `sync.` key allow-list, and the Notification Feed is device-local by
 * design, not Editable Data).
 */
const EDITABLE_TABLES = [
  'skillPlans',
  'buildPlans',
  'quickbars',
  'stationPins',
  'planetRichness',
  'payees',
  'miningTaxAssignments',
  'productionRuns',
  'productionSaleLinks',
  'productionOrderWatches',
] as const;

/** Untyped view of one Editable Data table, for the generic read/write loops below. */
function editableTable(name: (typeof EDITABLE_TABLES)[number]): Table<EditableRow, unknown> {
  return db[name] as unknown as Table<EditableRow, unknown>;
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
    if (rows?.length) await editableTable(table).bulkAdd(rows);
  }
}

/** Builds the full-device backup payload and encrypts it under `password`. */
export async function exportBackup(
  password: string
): Promise<{ filename: string; contents: string }> {
  const [characters, tokens, editableTables, allSettings] = await Promise.all([
    db.characters.toArray(),
    db.tokens.toArray(),
    readEditableTables(),
    db.settings.toArray(),
  ]);
  const settings = allSettings.filter((s) => isAllowedSyncedSettingKey(s.key));
  const payload: BackupPayload = buildBackupPayload(characters, tokens, editableTables, settings);
  const file = await encryptExportPayload(payload, password);
  const filename = `neocom-desk-backup-${new Date().toISOString().slice(0, 10)}.json`;
  return { filename, contents: JSON.stringify(file, null, 2) };
}

/** {@link exportBackup} plus triggering the browser download. */
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

/**
 * Decrypts `fileContents` under `password`, partitions it against what's
 * already on this device (issue #789's skip-whole-character-on-conflict
 * policy — see `payload.partitionImport`), and writes only the new rows.
 * Import never touches an existing Character's token or Editable Data.
 */
export async function importBackup(fileContents: string, password: string): Promise<ImportSummary> {
  const parsed: unknown = JSON.parse(fileContents);
  if (!isBackupFile(parsed)) {
    throw new Error('Not a Neocom Desk backup file');
  }
  const payload = (await decryptExportPayload(parsed, password)) as BackupPayload;

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
