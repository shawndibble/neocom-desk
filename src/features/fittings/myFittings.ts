import { isSyncConfigured } from '@/app/syncStatus';
import { db, type FittingRecord } from '@/db';
import { markFittingDeleted, scheduleSync } from '@/sync';
import { clampFittingDescription } from './saveToEve';

type SharedFittingsModule = typeof import('@/features/communities/sharedFittings');
let sharedModule: Promise<SharedFittingsModule> | undefined;

function followInCommunities(run: (shared: SharedFittingsModule) => Promise<void>) {
  if (!isSyncConfigured()) return;
  sharedModule ??= import('@/features/communities/sharedFittings');
  void sharedModule.then(run).catch(() => undefined);
}

export function loadFittings(characterId: number): Promise<FittingRecord[]> {
  return db.fittings.where('characterId').equals(characterId).toArray();
}

export interface FittingInput {
  id?: string;
  name: string;
  code: string;
  notes?: string;
}

export async function saveFitting(
  characterId: number,
  input: FittingInput
): Promise<FittingRecord> {
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
  scheduleSync(characterId, { collections: ['fittings'] });
  followInCommunities((shared) => shared.followSavedFitting(characterId, record));
  return record;
}

export function renameFitting(fitting: FittingRecord, name: string): Promise<FittingRecord> {
  return saveFitting(fitting.characterId, { id: fitting.id, name, code: fitting.code });
}

export async function renameFittingById(id: string, name: string): Promise<void> {
  const record = await db.fittings.get(id);
  if (record) await renameFitting(record, name);
}

export async function resolveSaveTarget(
  savedId: string | null,
  characterId: number,
  fallbackName: string
): Promise<{ id?: string; name: string }> {
  const existing = savedId === null ? undefined : await db.fittings.get(savedId);
  const updating = existing?.characterId === characterId ? existing : undefined;
  return { ...(updating ? { id: updating.id } : {}), name: updating?.name ?? fallbackName };
}

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
  followInCommunities((shared) => shared.unshareDeletedFitting(fitting.characterId, fitting.id));
}
