import { chunk, IN_QUERY_LIMIT } from './chunk.js';
import {
  RUNNING_ACCOUNTS,
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
import { soloMinerId } from './corpTaxBookDonationMatch.js';

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

export const MINER_KEYED = [
  LATE_NOTICES,
  PAYMENTS,
  WRITE_OFFS,
  ADJUSTMENTS,
  DECLARATIONS,
  REBILLS,
  TOLERANCE_EXEMPTIONS,
];
export const MINER_CACHES = [RUNNING_ACCOUNTS, MINER_PAID];

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
  targetUids: readonly string[];
  records: readonly RekeyRecord[];
  existingDisputeIds: ReadonlySet<string>;
}): RekeyWrite[] {
  const { target, targetUids, existingDisputeIds } = input;
  const writes: RekeyWrite[] = [];
  const claimed = new Set(existingDisputeIds);
  const readers = (data: Record<string, unknown>) =>
    'uids' in data ? { uids: [...targetUids] } : {};
  for (const { collection, id, data } of input.records) {
    if (MINER_CACHES.includes(collection)) {
      writes.push({ kind: 'delete', collection, id });
    } else if (collection === DISMISSALS) {
      if (data.scope === 'miner')
        writes.push({
          kind: 'update',
          collection,
          id,
          fields: { targetId: target, ...readers(data) },
        });
    } else if (collection === DISPUTES) {
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

export function soloTargets(
  miners: readonly {
    id: string;
    characterIds: readonly number[];
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

export interface RekeyIo {
  read(
    collection: string,
    field: string,
    ids: string[],
    also?: [string, string]
  ): Promise<RekeyRecord[]>;
  exists(collection: string, id: string): Promise<boolean>;
}

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
