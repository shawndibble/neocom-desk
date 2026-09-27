/**
 * My Fittings store (issue #1538): a saved Fitting is just its name and share
 * code, per Character Editable Data synced like a Payee (`sync/planSync.ts`'s
 * `fittingSpec`). Only an explicit save writes here — editing never does — and
 * deletes go through `markFittingDeleted` so the removal propagates.
 */
import { db, type FittingRecord } from '@/db';
import { markFittingDeleted, scheduleSync } from '@/sync';
import { clampFittingDescription } from './saveToEve';

export function loadFittings(characterId: number): Promise<FittingRecord[]> {
  return db.fittings.where('characterId').equals(characterId).toArray();
}

export interface FittingInput {
  /** Present when updating a saved Fitting; absent creates a new one. */
  id?: string;
  name: string;
  code: string;
  /** Omitted keeps a saved Fitting's existing notes; an empty string clears them. */
  notes?: string;
}

export async function saveFitting(
  characterId: number,
  input: FittingInput
): Promise<FittingRecord> {
  // Renaming or re-saving must not drop the notes the record already has.
  const existing = input.id === undefined ? undefined : await db.fittings.get(input.id);
  const notes = input.notes ?? existing?.notes ?? '';
  const record: FittingRecord = {
    id: input.id ?? crypto.randomUUID(),
    characterId,
    name: input.name,
    code: input.code,
    ...(notes === '' ? {} : { notes }),
    updatedAt: Date.now(),
  };
  await db.fittings.put(record);
  scheduleSync(characterId);
  return record;
}

export function renameFitting(fitting: FittingRecord, name: string): Promise<FittingRecord> {
  return saveFitting(fitting.characterId, { id: fitting.id, name, code: fitting.code });
}

/** Renames a saved record by id; a no-op if it's since been deleted. */
export async function renameFittingById(id: string, name: string): Promise<void> {
  const record = await db.fittings.get(id);
  if (record) await renameFitting(record, name);
}

/**
 * What a Save writes: continues `savedId` when it still belongs to this
 * Character, otherwise a fresh save under `fallbackName` — the record may
 * have been deleted from My Fittings, or reassigned, since it was opened.
 */
export async function resolveSaveTarget(
  savedId: string | null,
  characterId: number,
  fallbackName: string
): Promise<{ id?: string; name: string }> {
  const existing = savedId === null ? undefined : await db.fittings.get(savedId);
  const updating = existing?.characterId === characterId ? existing : undefined;
  return { ...(updating ? { id: updating.id } : {}), name: updating?.name ?? fallbackName };
}

/** Sets a saved Fitting's notes (kept to what EVE will take as a description). */
export function setFittingNotes(fitting: FittingRecord, notes: string): Promise<FittingRecord> {
  return saveFitting(fitting.characterId, {
    id: fitting.id,
    name: fitting.name,
    code: fitting.code,
    notes: clampFittingDescription(notes),
  });
}

export async function deleteFitting(fitting: FittingRecord): Promise<void> {
  await markFittingDeleted(fitting.characterId, fitting.id);
}
