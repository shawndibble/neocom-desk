/**
 * Mutated items' rolls from ESI's dynamic-item route — the one place the app
 * asks. Rolls never change, so answers are kept in Dexie for good. The route
 * has only ESI's error limit, so an id rejected with a 4xx (not 420/429) is
 * skipped for the session; other failures are retried. App-wide throttling is
 * `esi/budget.ts`'s; this only caps what it has in flight.
 */
import { db, type DynamicItemRecord } from '@/db';
import { getDogmaDynamicItem, type DynamicItem } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { mutationFromDynamicItem, type MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import type { ItemMutation } from '@/engine/fittings/types';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';

/** A mutated item to look up: its abyssal type and its own unique item id. */
export interface DynamicItemRef {
  typeId: number;
  itemId: number;
}

/**
 * In flight at once, per batch — below `ESI_FANOUT_CONCURRENCY`: this route has
 * only ESI's error limit, and a ship's mutated modules land in two rounds.
 */
const DEFAULT_CONCURRENCY = 4;

/** By `typeId:itemId`: a wrong type in a hand-edited URL must not block the item's real lookup. */
const rejectedThisSession = new Set<string>();
const refKey = (ref: DynamicItemRef) => `${ref.typeId}:${ref.itemId}`;

/** Test-only: forget the ids ESI rejected. */
export function resetDynamicItemFailuresForTests(): void {
  rejectedThisSession.clear();
}

function toRecord(ref: DynamicItemRef, item: DynamicItem): DynamicItemRecord {
  return {
    itemId: ref.itemId,
    typeId: ref.typeId,
    createdBy: item.created_by,
    sourceTypeId: item.source_type_id,
    mutatorTypeId: item.mutator_type_id,
    attributes: item.dogma_attributes.map((a) => [a.attribute_id, a.value]),
    savedAt: Date.now(),
  };
}

async function readCached(itemIds: readonly number[]): Promise<(DynamicItemRecord | undefined)[]> {
  try {
    return await db.dynamicItems.bulkGet([...itemIds]);
  } catch {
    // A blocked or failing database just means asking ESI.
    return itemIds.map(() => undefined);
  }
}

async function fetchOne(
  ref: DynamicItemRef,
  signal?: AbortSignal
): Promise<DynamicItemRecord | null> {
  if (rejectedThisSession.has(refKey(ref))) return null;
  try {
    const result = await getDogmaDynamicItem(ref.typeId, ref.itemId, signal ? { signal } : {});
    if (!result.data) return null;
    const record = toRecord(ref, result.data);
    await db.dynamicItems.put(record).catch(() => {
      // Not kept: it is asked for again next session, nothing worse.
    });
    return record;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    if (
      err instanceof EsiError &&
      err.status >= 400 &&
      err.status < 500 &&
      err.status !== 420 &&
      err.status !== 429
    ) {
      rejectedThisSession.add(refKey(ref));
    }
    return null;
  }
}

/**
 * One mutated item's dynamic attributes — cached, else fetched once; null when
 * ESI has none for it, or the item is cached under another type (item ids are unique).
 */
export async function getDynamicItem(ref: DynamicItemRef): Promise<DynamicItemRecord | null> {
  const [cached] = await readCached([ref.itemId]);
  if (cached) return cached.typeId === ref.typeId ? cached : null;
  return fetchOne(ref);
}

/**
 * Every ref's dynamic attributes, by item id: cached rows first, then one ESI
 * call per missing id (duplicates asked once), at most `concurrency` at a
 * time. An id that fails is left out of the map rather than failing the
 * batch; an aborted `signal` stops the asking and the map holds what arrived.
 */
export async function fetchDynamicItems(
  refs: readonly DynamicItemRef[],
  { concurrency = DEFAULT_CONCURRENCY, signal }: { concurrency?: number; signal?: AbortSignal } = {}
): Promise<Map<number, DynamicItemRecord>> {
  const unique = new Map<number, DynamicItemRef>();
  for (const ref of refs) if (!unique.has(ref.itemId)) unique.set(ref.itemId, ref);
  const ids = [...unique.keys()];
  const cached = await readCached(ids);
  const found = new Map<number, DynamicItemRecord>();
  const missing: DynamicItemRef[] = [];
  ids.forEach((id, index) => {
    const row = cached[index];
    if (row) found.set(id, row);
    else missing.push(unique.get(id)!);
  });

  await mapWithConcurrencyLimit(missing, concurrency, async (ref) => {
    if (signal?.aborted) return;
    try {
      const record = await fetchOne(ref, signal);
      if (record) found.set(ref.itemId, record);
    } catch (err) {
      if (!signal?.aborted) throw err;
    }
  });
  return found;
}

/** A stored record's attributes in ESI's `{ attribute_id, value }` shape. */
export function recordAttributes(
  record: DynamicItemRecord
): { attribute_id: number; value: number }[] {
  return record.attributes.map(([attribute_id, value]) => ({ attribute_id, value }));
}

/** `record`'s mutation, when it and this build's mutaplasmid data agree (`mutationFromDynamicItem`). */
export function mutationFromRecord(
  typeId: number,
  record: DynamicItemRecord,
  lookup: MutaplasmidLookup
): ItemMutation | null {
  return mutationFromDynamicItem(
    typeId,
    {
      source_type_id: record.sourceTypeId,
      mutator_type_id: record.mutatorTypeId,
      dogma_attributes: recordAttributes(record),
    },
    lookup
  );
}

/**
 * The `ItemMutation` of each ref ESI and this build's mutaplasmid data agree
 * on, by item id: base, mutaplasmid, and only the rolls that mutaplasmid
 * makes. An item missing from the map has no known rolls
 * (`mutationStatus` reads it as `'baseUnknown'`).
 */
export async function mutationsForItems(
  refs: readonly DynamicItemRef[],
  lookup: MutaplasmidLookup,
  options?: { concurrency?: number; signal?: AbortSignal }
): Promise<Map<number, ItemMutation>> {
  const items = await fetchDynamicItems(refs, options);
  const mutations = new Map<number, ItemMutation>();
  for (const ref of refs) {
    const record = items.get(ref.itemId);
    if (!record) continue;
    const mutation = mutationFromRecord(ref.typeId, record, lookup);
    if (mutation) mutations.set(ref.itemId, mutation);
  }
  return mutations;
}
