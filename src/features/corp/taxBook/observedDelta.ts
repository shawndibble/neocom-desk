/**
 * What re-opening an officer's Corp Tax Book reads of `observed` (ADR 0031):
 * the rows written since this device's last read, not the collection. Pure —
 * `observedStore.ts` holds the Dexie copy and `bookClient.ts` the queries.
 *
 * Rows are keyed by obsId and a merge rewrites one in place (quantity grows),
 * so a date field cannot name "new or changed"; the server stamps each write
 * (`updatedAt`, corpTaxBookVersionKeys.ts) and the watermark is the newest
 * stamp held. Rows are never deleted by the app, so a delta cannot miss a
 * removal; the daily full read bounds anything else (a write by a server
 * from before the stamp, a clock oddity).
 */
import { BOOK_CACHE_MAX_AGE_MS } from './bookCache';

/** Reread this much before the watermark: concurrent writes commit out of stamp order. */
export const OBSERVED_OVERLAP_MS = 10 * 60_000;
/** The whole collection is read again at least this often. */
export const OBSERVED_FULL_REFRESH_MS = 24 * 60 * 60 * 1000;

/** What a device remembers about its copy of one book's `observed`. */
export interface ObservedCopyMeta {
  /** The collection's version stamp when last read; absent when the server had none. */
  version: string | undefined;
  /** When the copy was last confirmed current. */
  checkedAt: number;
  /** When the whole collection was last read. */
  fullAt: number;
  /** The newest `updatedAt` held, ms; null while no held row is stamped. */
  watermark: number | null;
}

export type ObservedPlan = { kind: 'cached' } | { kind: 'delta'; since: number } | { kind: 'full' };

export function planObservedRead(
  held: ObservedCopyMeta | undefined,
  version: string | undefined,
  now: number
): ObservedPlan {
  if (!held || held.watermark === null || now - held.fullAt > OBSERVED_FULL_REFRESH_MS)
    return { kind: 'full' };
  if (
    version !== undefined &&
    held.version === version &&
    now - held.checkedAt <= BOOK_CACHE_MAX_AGE_MS
  )
    return { kind: 'cached' };
  // A stamp from a clock ahead of this one must not skip rows written since.
  return { kind: 'delta', since: Math.min(held.watermark, now) - OBSERVED_OVERLAP_MS };
}

export interface StoredObserved<R> {
  /** The Firestore document id. */
  id: string;
  row: R;
  /** Its `updatedAt` in ms; null for a row from before the server stamped them. */
  updatedMs: number | null;
}

/** The copy with the delta's rows replacing or joining it, and the watermark that follows. */
export function applyObservedDelta<R>(
  held: readonly StoredObserved<R>[],
  delta: readonly StoredObserved<R>[],
  watermark: number | null
): { rows: StoredObserved<R>[]; watermark: number | null } {
  const byId = new Map(held.map((r) => [r.id, r]));
  let next = watermark;
  for (const r of delta) {
    byId.set(r.id, r);
    if (r.updatedMs !== null && (next === null || r.updatedMs > next)) next = r.updatedMs;
  }
  return { rows: [...byId.values()], watermark: next };
}

/** A Firestore Timestamp or a plain number, as milliseconds; null for anything else. */
export function millisOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === 'function' ? (toMillis.call(value) as number) : null;
}
