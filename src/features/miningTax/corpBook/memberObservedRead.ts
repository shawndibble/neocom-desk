/**
 * A member's own `observed` rows through the part store (#5243, ADR 0031's delta
 * on the member side): nothing while the collection's stamp is unchanged, the
 * own rows written since the watermark otherwise, all own rows when no copy can
 * be trusted. The query is `uid == me` (the rules' own-line check) plus the
 * `updatedAt` watermark; the plan is the officer's (`planObservedRead`).
 */
import { collection, getDocs, query, where } from 'firebase/firestore/lite';
import type { Firestore } from 'firebase/firestore/lite';
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
}): Promise<{ id: string; data: Data }[]> {
  const out = (rows: StoredObserved<Data>[]) => rows.map((r) => ({ id: r.id, data: r.row }));
  const col = collection(db, root, 'observed');
  const own = where('uid', '==', uid);

  let copy = memoryCopy(key, MEMBER_OBSERVED_SLOT);
  if (!copy) copy = await store.load(MEMBER_OBSERVED_SLOT).catch(() => undefined);
  const held = copy?.data as Held | undefined;
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
      delta = toStored(
        (
          await getDocs(
            query(col, own, where(OBSERVED_UPDATED_AT_FIELD, '>=', new Date(plan.since)))
          )
        ).docs as never
      );
    } catch {
      // Its composite index is not deployed yet: read the own rows whole, as before.
      delta = null;
    }
  }
  if (delta && held) {
    const merged = applyObservedDelta(held.rows, delta, held.watermark);
    next = { ...held, rows: merged.rows, watermark: merged.watermark };
  } else {
    const rows = toStored((await getDocs(query(col, own))).docs as never);
    next = {
      rows,
      fullAt: now,
      watermark: applyObservedDelta([], rows, null).watermark,
      ...(bookCreatedAt !== undefined ? { bookCreatedAt } : {}),
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
