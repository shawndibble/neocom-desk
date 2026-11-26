import { BOOK_CACHE_MAX_AGE_MS } from './bookCache';
import { MINUTE_MS } from '@/lib/age';

export const OBSERVED_OVERLAP_MS = 10 * MINUTE_MS;

export interface ObservedCopyMeta {
  version: string | undefined;
  checkedAt: number;
  fullAt: number;
  watermark: number | null;
  bookCreatedAt?: number;
}

export type ObservedPlan = { kind: 'cached' } | { kind: 'delta'; since: number } | { kind: 'full' };

export function planObservedRead(
  held: ObservedCopyMeta | undefined,
  version: string | undefined,
  now: number,
  bookCreatedAt?: number
): ObservedPlan {
  if (!held || held.fullAt > now || held.checkedAt > now) return { kind: 'full' };
  if (bookCreatedAt !== undefined && held.bookCreatedAt !== bookCreatedAt) return { kind: 'full' };
  if (
    version !== undefined &&
    held.version === version &&
    now - held.checkedAt <= BOOK_CACHE_MAX_AGE_MS
  )
    return { kind: 'cached' };
  if (held.watermark === null) return { kind: 'full' };
  return { kind: 'delta', since: Math.min(held.watermark, now) - OBSERVED_OVERLAP_MS };
}

export interface StoredObserved<R> {
  id: string;
  row: R;
  updatedMs: number | null;
}

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

export function millisOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const toMillis = (value as { toMillis?: unknown } | null | undefined)?.toMillis;
  return typeof toMillis === 'function' ? (toMillis.call(value) as number) : null;
}
