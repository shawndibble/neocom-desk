/**
 * A member's own `observed` rows through the part store (#5243, ADR 0031's delta
 * on the member side): nothing while the collection's stamp is unchanged, the
 * own rows written since the watermark otherwise, all own rows when no copy can
 * be trusted. Two queries, merged by doc id: `uid == me` (the rules' own-line
 * check), and `uids` array-contains me (every reader of the row's Character's
 * Miner, so an alt's mined rows reach the main's Tax tab). Each takes the
 * `updatedAt` watermark for a delta; the plan is the officer's
 * (`planObservedRead`). A server that has not stamped `uids` on the rows yet
 * finds nothing by it, or refuses it: the `uid` read stands.
 */
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import type { Firestore, QueryConstraint } from 'firebase/firestore/lite';
import { OBSERVED_UPDATED_AT_FIELD } from '../../../../functions/src/corpTaxBookVersionKeys';
import {
  memoryCopy,
  setMemoryCopy,
  type Copy,
  type PartStore,
} from '@/features/corp/taxBook/bookCache';
import {
  applyObservedDelta,
  millisOf,
  planObservedRead,
  type ObservedCopyMeta,
  type StoredObserved,
} from '@/features/corp/taxBook/observedDelta';

type Data = Record<string, unknown>;
export const MEMBER_OBSERVED_SLOT = 'observed';

/** What the copy holds besides its rows: the officer's `ObservedCopyMeta` minus the stamp. */
interface Held {
  rows: StoredObserved<Data>[];
  fullAt: number;
  watermark: number | null;
  bookCreatedAt?: number;
  /** The book's `readersEpoch` the rows were read under (absent: 0). */
  readersEpoch?: number;
}

function toStored(docs: { id: string; data: () => Data }[]): StoredObserved<Data>[] {
  return docs.map((d) => {
    const { [OBSERVED_UPDATED_AT_FIELD]: stamp, ...row } = d.data();
    return { id: d.id, row, updatedMs: millisOf(stamp) };
  });
}

export async function readMemberObserved({
  db,
  key,
  root,
  uid,
  version,
  store,
  now = Date.now(),
  bookCreatedAt,
  readersEpoch = 0,
}: {
  db: Firestore;
  key: string;
  root: string;
  uid: string;
  /** The `observed` stamp on the book document; undefined when the server never stamped it. */
  version: string | undefined;
  store: PartStore;
  now?: number;
  bookCreatedAt?: number;
  /**
   * The book's `readersEpoch`: it moves when the server takes a reader off rows or backfills
   * them. A copy read under another epoch may hold rows this Character can no longer read, or
   * lack ones it now can, so it is read again whole and replaced.
   */
  readersEpoch?: number;
}): Promise<{ id: string; data: Data }[]> {
  const out = (rows: StoredObserved<Data>[]) => rows.map((r) => ({ id: r.id, data: r.row }));
  const col = collection(db, root, 'observed');
  const own = where('uid', '==', uid);
  const readers = where('uids', 'array-contains', uid);
  /**
   * One window of rows, the own ones and every reader's. `strict`: a refused `uids` read fails
   * the window (a delta must miss nothing); otherwise the own rows stand alone.
   */
  const readWindow = async (extra: QueryConstraint[], strict: boolean) => {
    const [mine, theirs] = await Promise.all([
      getDocs(query(col, own, ...extra)),
      getDocs(query(col, readers, ...extra)).catch((error: unknown) => {
        if (strict) throw error;
        return null;
      }),
    ]);
    const byId = new Map<string, StoredObserved<Data>>();
    for (const r of [
      ...toStored(mine.docs as never),
      ...(theirs ? toStored(theirs.docs as never) : []),
    ])
      byId.set(r.id, r);
    return [...byId.values()];
  };

  let copy = memoryCopy(key, MEMBER_OBSERVED_SLOT);
  if (!copy) copy = await store.load(MEMBER_OBSERVED_SLOT).catch(() => undefined);
  // A copy read under another readers epoch is no copy: read it all again.
  const stored = copy?.data as Held | undefined;
  const held = stored && (stored.readersEpoch ?? 0) === readersEpoch ? stored : undefined;
  const meta: ObservedCopyMeta | undefined =
    copy && held
      ? {
          version: copy.version === '' ? undefined : copy.version,
          checkedAt: copy.at,
          fullAt: held.fullAt,
          watermark: held.watermark,
          bookCreatedAt: held.bookCreatedAt,
        }
      : undefined;
  const plan = planObservedRead(meta, version, now, bookCreatedAt);
  if (plan.kind === 'cached' && held) {
    if (copy) setMemoryCopy(key, MEMBER_OBSERVED_SLOT, copy);
    return out(held.rows);
  }

  let next: Held;
  let delta: StoredObserved<Data>[] | null = null;
  if (plan.kind === 'delta' && held) {
    try {
      delta = await readWindow(
        [where(OBSERVED_UPDATED_AT_FIELD, '>=', new Date(plan.since))],
        true
      );
    } catch {
      // Its composite index is not deployed yet: read the rows whole, as before.
      delta = null;
    }
  }
  if (delta && held) {
    const merged = applyObservedDelta(held.rows, delta, held.watermark);
    next = { ...held, rows: merged.rows, watermark: merged.watermark };
  } else {
    const rows = await readWindow([], false);
    next = {
      rows,
      fullAt: now,
      watermark: applyObservedDelta([], rows, null).watermark,
      ...(bookCreatedAt !== undefined ? { bookCreatedAt } : {}),
      readersEpoch,
    };
  }
  if (version === undefined) {
    setMemoryCopy(key, MEMBER_OBSERVED_SLOT, undefined);
    await store.forget(MEMBER_OBSERVED_SLOT).catch(() => {});
  } else {
    const saved: Copy = { version, at: now, data: next };
    setMemoryCopy(key, MEMBER_OBSERVED_SLOT, saved);
    await store.save(MEMBER_OBSERVED_SLOT, saved).catch(() => {});
  }
  return out(next.rows);
}
