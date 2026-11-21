import { chunk, IN_QUERY_LIMIT } from './chunk.js';
import {
  ACCOUNTS,
  ADJUSTMENTS,
  DECLARATIONS,
  DISMISSALS,
  disputeIdFor,
  DISPUTES,
  LATE_NOTICES,
  MINER_PAID,
  PAYMENTS,
  REBILLS,
  TOLERANCE_EXEMPTIONS,
  WRITE_OFFS,
} from './corpTaxBook.js';
import { paymentUids } from './corpTaxBookClaims.js';
import { soloMinerId } from './corpTaxBookDonationMatch.js';
import { LEGACY_MINER_KEYED } from './corpTaxBookLegacyMirror.js';

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
export const MINER_KEYED = [
  LATE_NOTICES,
  ...LEGACY_MINER_KEYED,
  PAYMENTS,
  WRITE_OFFS,
  ADJUSTMENTS,
  DECLARATIONS,
  REBILLS,
  TOLERANCE_EXEMPTIONS,
];
/**
 * Collections keyed by the Miner id itself (`accounts/{minerId}`, `minerPaid/{minerId}`): figures
 * an officer's tab records again on its next load. A checkpoint is dropped by the caller with every
 * Miner whose characters change, not here.
 */
export const MINER_CACHES = [ACCOUNTS, MINER_PAID];

/** The Miner ids a grouping absorbs: the groups dissolved, and a `solo:` id per Character folded in. */
export function absorbedMinerIds(
  target: string,
  characterIds: readonly number[],
  absorbMinerIds: readonly string[]
): string[] {
  const ids = new Set([...absorbMinerIds, ...characterIds.map(soloMinerId)]);
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
  // `uids` are the sign-ins the rules let read the record; a record without any keeps none, but a
  // payment always gets them (an older one read by its sender's `uid` alone included).
  const readers = (data: Record<string, unknown>, collection: string) =>
    collection === PAYMENTS
      ? { uids: paymentUids(targetUids, data.uid) }
      : 'uids' in data
        ? { uids: [...targetUids] }
        : {};
  for (const { collection, id, data } of input.records) {
    if (MINER_CACHES.includes(collection)) {
      writes.push({ kind: 'delete', collection, id });
    } else if (collection === DISMISSALS) {
      if (data.scope === 'miner')
        writes.push({
          kind: 'update',
          collection,
          id,
          fields: { targetId: target, ...readers(data, collection) },
        });
    } else if (collection === DISPUTES) {
      const fields = { minerId: target, ...readers(data, collection) };
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
        fields: { minerId: target, ...readers(data, collection) },
      });
    }
  }
  return writes;
}

/** For the backfill: each confirmed grouped Character's `solo:` id, mapped to the group it belongs to now. */
export function soloTargets(
  miners: readonly {
    id: string;
    characterIds: readonly number[];
    /** A guest's Character not yet confirmed keeps its own Miner (D26b). */
    pendingConfirmation?: readonly number[];
  }[]
): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of miners)
    for (const c of m.characterIds)
      if (soloMinerId(c) !== m.id && !m.pendingConfirmation?.includes(c))
        out.set(soloMinerId(c), m.id);
  return out;
}

/** What the records of a Miner id are read through: a transaction in the store, a plain query in the backfill. */
export interface RekeyIo {
  read(
    collection: string,
    field: string,
    ids: string[],
    also?: [string, string]
  ): Promise<RekeyRecord[]>;
  exists(collection: string, id: string): Promise<boolean>;
}

/** Every record the absorbed Miners hold, and the dispute ids the target already has. */
export async function loadRekeyRecords(
  io: RekeyIo,
  target: string,
  absorbed: readonly string[]
): Promise<{ records: RekeyRecord[]; existingDisputeIds: Set<string> }> {
  const records: RekeyRecord[] = [];
  const read = async (collection: string, field: string, also?: [string, string]) => {
    for (const ids of chunk(absorbed, IN_QUERY_LIMIT))
      records.push(...(await io.read(collection, field, ids, also)));
  };
  for (const collection of [...MINER_KEYED, DISPUTES]) await read(collection, 'minerId');
  await read(DISMISSALS, 'targetId', ['scope', 'miner']);
  // Caches are keyed by the Miner id itself.
  for (const id of absorbed)
    for (const collection of MINER_CACHES)
      if (await io.exists(collection, id)) records.push({ collection, id, data: {} });
  const existingDisputeIds = new Set<string>();
  for (const r of records.filter((x) => x.collection === DISPUTES)) {
    const id = disputeIdFor(target, String(r.data.date));
    if (await io.exists(DISPUTES, id)) existingDisputeIds.add(id);
  }
  return { records, existingDisputeIds };
}
