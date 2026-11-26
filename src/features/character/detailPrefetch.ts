import { cachedKeySet } from '@/esi/cache';
import { inBackgroundLane } from '@/esi/lane';
import { mapWithConcurrencyLimit } from '@/lib/concurrency';
import { currentWarmLevel } from '@/lib/lazyAssetWarmGate';

export const MAIL_BODY_PREFETCH_LIMIT = 20;
export const CALENDAR_PREFETCH_LIMIT = 20;
export const CALENDAR_PREFETCH_DAYS = 14;
export const DETAIL_PREFETCH_CONCURRENCY = 2;

export function detailPrefetchAllowed(): boolean {
  return currentWarmLevel() === 'all';
}

const failedThisSession = new Map<string, Set<number>>();

function failedIds(kind: string, characterId: number): Set<number> {
  const key = `${kind}:${characterId}`;
  let ids = failedThisSession.get(key);
  if (ids === undefined) {
    ids = new Set();
    failedThisSession.set(key, ids);
  }
  return ids;
}

export function resetDetailPrefetchForTests(): void {
  failedThisSession.clear();
}

export async function prefetchDetails(
  ids: readonly number[],
  load: (id: number) => Promise<unknown>
): Promise<number[]> {
  const attempted: number[] = [];
  await mapWithConcurrencyLimit(ids, DETAIL_PREFETCH_CONCURRENCY, async (id) => {
    if (!detailPrefetchAllowed()) return;
    attempted.push(id);
    try {
      await inBackgroundLane(() => load(id));
    } catch {}
  });
  return attempted;
}

export async function prefetchMissing(input: {
  kind: 'mail-body' | 'calendar-event';
  characterId: number;
  allIds: readonly number[];
  keyOf: (id: number) => string;
  select: (skip: ReadonlySet<number>) => number[];
  load: (id: number) => Promise<unknown>;
}): Promise<void> {
  try {
    if (!detailPrefetchAllowed()) return;
    const cachedKeys = await cachedKeySet(input.characterId, input.allIds.map(input.keyOf));
    if (cachedKeys === null) return;
    const failed = failedIds(input.kind, input.characterId);
    const skip = new Set(
      input.allIds.filter((id) => cachedKeys.has(input.keyOf(id)) || failed.has(id))
    );
    const attempted = await prefetchDetails(input.select(skip), input.load);
    if (attempted.length === 0) return;
    const after = await cachedKeySet(input.characterId, attempted.map(input.keyOf));
    if (after === null) return;
    for (const id of attempted) if (!after.has(input.keyOf(id))) failed.add(id);
  } catch {}
}
