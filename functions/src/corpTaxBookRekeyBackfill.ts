import type { Firestore } from 'firebase-admin/firestore';
import { chunk } from './chunk.js';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import {
  MINER_CACHES,
  MINER_KEYED,
  planRekey,
  soloTargets,
  type RekeyWrite,
} from './corpTaxBookRekey.js';
import { disputeIdFor } from './corpTaxBook.js';
import { invalidateMinerTotals } from './corpTaxBookMinerTotalsStore.js';
import { invalidateReadModels } from './corpTaxBookReadModelsStore.js';

const IN_LIMIT = 30;
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
  const miners = (await sub(db, corporationId, 'miners').get()).docs.map((d) => ({
    id: d.id,
    characterIds: (d.get('characterIds') as number[]) ?? [],
    uids: (d.get('uids') as string[]) ?? [],
  }));
  const groupOf = soloTargets(miners);
  const known = new Set(miners.map((m) => m.id));
  const byGroup = new Map<string, string[]>();
  for (const [solo, group] of groupOf) byGroup.set(group, [...(byGroup.get(group) ?? []), solo]);

  const writes: RekeyWrite[] = [];
  const named = new Set<string>();
  for (const [group, solos] of byGroup) {
    const target = miners.find((m) => m.id === group)!;
    const records: Parameters<typeof planRekey>[0]['records'][number][] = [];
    const read = async (collection: string, field: string, extra?: [string, string]) => {
      for (const ids of chunk(solos, IN_LIMIT)) {
        let q = sub(db, corporationId, collection).where(field, 'in', ids);
        if (extra) q = q.where(extra[0], '==', extra[1]);
        for (const d of (await q.get()).docs)
          records.push({ collection, id: d.id, data: d.data() });
      }
    };
    for (const collection of [...MINER_KEYED, 'disputes']) await read(collection, 'minerId');
    await read('dismissals', 'targetId', ['scope', 'miner']);
    for (const id of solos)
      for (const collection of MINER_CACHES) {
        if ((await sub(db, corporationId, collection).doc(id).get()).exists)
          records.push({ collection, id, data: {} });
      }
    const existingDisputeIds = new Set<string>();
    for (const r of records.filter((x) => x.collection === 'disputes')) {
      const id = disputeIdFor(group, String(r.data.date));
      if ((await sub(db, corporationId, 'disputes').doc(id).get()).exists)
        existingDisputeIds.add(id);
    }
    writes.push(
      ...planRekey({ target: group, targetUids: target.uids, records, existingDisputeIds })
    );
  }

  // Anything else naming a Miner nobody holds: a dissolved group the backfill cannot place.
  for (const collection of MINER_KEYED)
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
  const groups = [
    ...new Set(
      plan.writes.flatMap((w) =>
        w.kind === 'update' && 'minerId' in w.fields ? [String(w.fields.minerId)] : []
      )
    ),
  ];
  await invalidateMinerTotals(db, plan.corporationId, groups);
  await invalidateReadModels(db, plan.corporationId);
}
