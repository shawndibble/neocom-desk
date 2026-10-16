/**
 * Mutated (abyssal) items' rolls from ESI's
 * `GET /dogma/dynamic/items/{type_id}/{item_id}` — the one place the app asks,
 * shared by Fittings (an asset ship opened in the editor), Assets and
 * pricing.
 *
 * An item's rolls never change, so every answer is kept in Dexie
 * (`dynamicItems`) for good and ESI is asked once per item id, ever. The
 * route has no rate-limit group, only ESI's error limit, and an id that isn't
 * a mutated item answers 400 — so an id ESI rejected (any 4xx) is remembered
 * for the session and not asked again. A failure that isn't the id's fault
 * (5xx, offline, the app's own ESI budget) is not remembered.
 *
 * Throttling across the app is the ESI gate's job (`esi/budget.ts`);
 * `fetchDynamicItems` only caps how many it has in flight at once.
 */
import { db, type DynamicItemRecord } from '@/db';
import { getDogmaDynamicItem, type DynamicItem } from '@/esi/endpoints';
import { EsiError } from '@/esi/errors';
import { mutationFromDynamicItem, type MutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import type { ItemMutation } from '@/engine/fittings/types';

/** A mutated item to look up: its abyssal type and its own unique item id. */
export interface DynamicItemRef {
  typeId: number;
  itemId: number;
}

/** In flight at once, per batch: a ship's worth of mutated modules lands in two rounds. */
const DEFAULT_CONCURRENCY = 4;

const rejectedThisSession = new Set<number>();

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

async function fetchOne(ref: DynamicItemRef): Promise<DynamicItemRecord | null> {
  if (rejectedThisSession.has(ref.itemId)) return null;
  try {
    const result = await getDogmaDynamicItem(ref.typeId, ref.itemId);
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
      rejectedThisSession.add(ref.itemId);
    }
    return null;
  }
}

/** One mutated item's dynamic attributes — cached, else fetched once; null when ESI has none for it. */
export async function getDynamicItem(ref: DynamicItemRef): Promise<DynamicItemRecord | null> {
  const [cached] = await readCached([ref.itemId]);
  return cached ?? fetchOne(ref);
}

/**
 * Every ref's dynamic attributes, by item id: cached rows first, then one ESI
 * call per missing id (duplicates asked once), at most `concurrency` at a
 * time. An id that fails is left out of the map rather than failing the
 * batch; an aborted `signal` rejects.
 */
export async function fetchDynamicItems(
  refs: readonly DynamicItemRef[],
  { concurrency = DEFAULT_CONCURRENCY, signal }: { concurrency?: number; signal?: AbortSignal } = {}
): Promise<Map<number, DynamicItemRecord>> {
  signal?.throwIfAborted();
  const unique = new Map<number, DynamicItemRef>();
  for (const ref of refs) if (!unique.has(ref.itemId)) unique.set(ref.itemId, ref);
  const ids = [...unique.keys()];
  const cached = await readCached(ids);
  const found = new Map<number, DynamicItemRecord>();
  const missing: DynamicItemRef[] = [];
  ids.forEach((id, index) => {
    const row = cached[index];
    if (row) found.set(id, row);
    else if (!rejectedThisSession.has(id)) missing.push(unique.get(id)!);
  });

  let next = 0;
  const worker = async () => {
    while (next < missing.length) {
      signal?.throwIfAborted();
      const ref = missing[next++]!;
      const record = await fetchOne(ref);
      if (record) found.set(ref.itemId, record);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, missing.length)) }, worker)
  );
  return found;
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
    const mutation = mutationFromDynamicItem(
      ref.typeId,
      {
        source_type_id: record.sourceTypeId,
        mutator_type_id: record.mutatorTypeId,
        dogma_attributes: record.attributes.map(([attribute_id, value]) => ({
          attribute_id,
          value,
        })),
      },
      lookup
    );
    if (mutation) mutations.set(ref.itemId, mutation);
  }
  return mutations;
}
