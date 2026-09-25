/**
 * My Fittings store (issue #1538): a saved Fitting is just its name and share
 * code, per Character Editable Data synced like a Payee (`sync/planSync.ts`'s
 * `fittingSpec`). Only an explicit save writes here — editing never does — and
 * deletes go through `markFittingDeleted` so the removal propagates.
 */
import { db, type FittingRecord } from '@/db';
import { markFittingDeleted, scheduleSync } from '@/sync';

export function loadFittings(characterId: number): Promise<FittingRecord[]> {
  return db.fittings.where('characterId').equals(characterId).toArray();
}

export interface FittingInput {
  /** Present when updating a saved Fitting; absent creates a new one. */
  id?: string;
  name: string;
  code: string;
}

export async function saveFitting(
  characterId: number,
  input: FittingInput
): Promise<FittingRecord> {
  const record: FittingRecord = {
    id: input.id ?? crypto.randomUUID(),
    characterId,
    name: input.name,
    code: input.code,
    updatedAt: Date.now(),
  };
  await db.fittings.put(record);
  scheduleSync(characterId);
  return record;
}

export function renameFitting(fitting: FittingRecord, name: string): Promise<FittingRecord> {
  return saveFitting(fitting.characterId, { id: fitting.id, name, code: fitting.code });
}

export async function deleteFitting(fitting: FittingRecord): Promise<void> {
  await markFittingDeleted(fitting.characterId, fitting.id);
}
