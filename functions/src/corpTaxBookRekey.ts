import { disputeIdFor } from './corpTaxBook.js';

/**
 * Grouping Characters into one Miner (#6450): everything the absorbed Miners were billed, paid
 * or disputed moves onto the surviving id, so the Miners table lists one row and one balance.
 * Pure: the store reads the records, this plans the writes, the store applies them.
 */

export interface RekeyRecord {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export type RekeyWrite =
  | { kind: 'update'; collection: string; id: string; fields: Record<string, unknown> }
  | {
      kind: 'move';
      collection: string;
      fromId: string;
      toId: string;
      data: Record<string, unknown>;
    }
  | { kind: 'delete'; collection: string; id: string };

/** Collections whose records carry `minerId`. */
export const MINER_KEYED = ['statements', 'payments', 'writeOffs', 'adjustments', 'declarations'];
/** Collections keyed by the Miner id itself (`accounts/{minerId}`, `minerTotals/{minerId}`): only caches. */
export const MINER_CACHES = ['accounts', 'minerTotals'];

/** The Miner ids a grouping absorbs: the groups dissolved, and a `solo:` id per Character folded in. */
export function absorbedMinerIds(
  target: string,
  characterIds: readonly number[],
  absorbMinerIds: readonly string[]
): string[] {
  const ids = new Set([...absorbMinerIds, ...characterIds.map((c) => `solo:${c}`)]);
  ids.delete(target);
  return [...ids];
}

export function planRekey(input: {
  target: string;
  /** The grouped Miner's readers: a record keeps being readable by each of its Characters. */
  targetUids: readonly string[];
  records: readonly RekeyRecord[];
  /** Dispute doc ids already filed under the target, so a move never overwrites one. */
  existingDisputeIds: ReadonlySet<string>;
}): RekeyWrite[] {
  const { target, targetUids, existingDisputeIds } = input;
  const writes: RekeyWrite[] = [];
  const claimed = new Set(existingDisputeIds);
  // `uids` are the sign-ins the rules let read the record; a record without any keeps none.
  const readers = (data: Record<string, unknown>) =>
    'uids' in data ? { uids: [...targetUids] } : {};
  for (const { collection, id, data } of input.records) {
    if (MINER_CACHES.includes(collection)) {
      writes.push({ kind: 'delete', collection, id });
    } else if (collection === 'dismissals') {
      if (data.scope === 'miner')
        writes.push({
          kind: 'update',
          collection,
          id,
          fields: { targetId: target, ...readers(data) },
        });
    } else if (collection === 'disputes') {
      const fields = { minerId: target, ...readers(data) };
      const toId = disputeIdFor(target, String(data.date));
      if (claimed.has(toId)) {
        writes.push({ kind: 'update', collection, id, fields });
      } else {
        claimed.add(toId);
        writes.push({ kind: 'move', collection, fromId: id, toId, data: { ...data, ...fields } });
      }
    } else {
      writes.push({
        kind: 'update',
        collection,
        id,
        fields: { minerId: target, ...readers(data) },
      });
    }
  }
  return writes;
}

/** For the backfill: each grouped Character's `solo:` id, mapped to the group it belongs to now. */
export function soloTargets(
  miners: readonly { id: string; characterIds: readonly number[] }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of miners)
    for (const c of m.characterIds) if (`solo:${c}` !== m.id) out.set(`solo:${c}`, m.id);
  return out;
}
