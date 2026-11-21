import type { Firestore } from 'firebase-admin/firestore';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import {
  loadRekeyRecords,
  MINER_KEYED,
  planRekey,
  soloTargets,
  type RekeyIo,
  type RekeyWrite,
} from './corpTaxBookRekey.js';
import { DISPUTES, MINERS } from './corpTaxBook.js';
import { invalidateReadModels } from './corpTaxBookReadModelsStore.js';

const sub = (db: Firestore, corporationId: number, name: string) =>
  db.collection('corps').doc(String(corporationId)).collection(name);

export interface RekeyBackfillPlan {
  corporationId: number;
  writes: RekeyWrite[];
  /** Miner ids some record names that no grouping holds and no `solo:` id of a grouped Character explains. */
  unresolved: string[];
}

/**
 * Groups made before #6450 left each absorbed Miner's records under its old id. This finds the
 * ones a `solo:<characterId>` of a now-grouped Character explains and plans their move onto the
 * group, with the same `planRekey` a new grouping uses. A dissolved group's id names no
 * Character, so it is reported in `unresolved` for an officer to look at.
 */
export async function planRekeyBackfill(
  db: Firestore,
  corporationId: number
): Promise<RekeyBackfillPlan> {
  const miners = (await sub(db, corporationId, MINERS).get()).docs.map((d) => ({
    id: d.id,
    characterIds: (d.get('characterIds') ?? []) as number[],
    pendingConfirmation: (d.get('pendingConfirmation') ?? []) as number[],
    uids: (d.get('uids') ?? []) as string[],
  }));
  const byGroup = new Map<string, string[]>();
  for (const [solo, group] of soloTargets(miners))
    byGroup.set(group, [...(byGroup.get(group) ?? []), solo]);

  const io: RekeyIo = {
    read: async (collection, field, ids, also) => {
      let q = sub(db, corporationId, collection).where(field, 'in', ids);
      if (also) q = q.where(also[0], '==', also[1]);
      return (await q.get()).docs.map((d) => ({ collection, id: d.id, data: d.data() }));
    },
    exists: async (collection, id) =>
      (await sub(db, corporationId, collection).doc(id).get()).exists,
  };
  const writes: RekeyWrite[] = [];
  for (const [group, solos] of byGroup) {
    const { records, existingDisputeIds } = await loadRekeyRecords(io, group, solos);
    const uids = miners.find((m) => m.id === group)!.uids;
    writes.push(...planRekey({ target: group, targetUids: uids, records, existingDisputeIds }));
  }

  // Anything else naming a Miner nobody holds: a dissolved group the backfill cannot place.
  const known = new Set(miners.map((m) => m.id));
  const named = new Set<string>();
  for (const collection of [...MINER_KEYED, DISPUTES])
    for (const d of (await sub(db, corporationId, collection).select('minerId').get()).docs) {
      const id = d.get('minerId');
      if (typeof id === 'string' && !known.has(id) && !id.startsWith('solo:')) named.add(id);
    }
  return { corporationId, writes, unresolved: [...named] };
}

/** Applies a plan in batches. A re-run finds nothing left to move. */
export async function applyRekeyBackfill(db: Firestore, plan: RekeyBackfillPlan): Promise<void> {
  const col = (name: string) => sub(db, plan.corporationId, name);
  const ops: BatchOp[] = plan.writes.flatMap((w): BatchOp[] =>
    w.kind === 'update'
      ? [(b) => b.update(col(w.collection).doc(w.id), w.fields)]
      : w.kind === 'delete'
        ? [(b) => b.delete(col(w.collection).doc(w.id))]
        : [
            (b) => b.set(col(w.collection).doc(w.toId), w.data),
            (b) => b.delete(col(w.collection).doc(w.fromId)),
          ]
  );
  await commitInBatches(db, ops);
  // The Miners and Overview docs were built from the old ids: drop them so the next read rebuilds.
  await invalidateReadModels(db, plan.corporationId);
}
