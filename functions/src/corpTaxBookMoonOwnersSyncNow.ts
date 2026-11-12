// Sync now for moon owners (issue #6117): an editor of a Collector book reads every moon owner
// at once instead of waiting for the next scheduled run. Each read is the scheduled pass's own
// `syncOneFeeder`, so health, Extractions, refinery names and the views move exactly as they do
// every six hours. Rested per book so a repeated press cannot spend the shared ESI error budget.

import type { Firestore } from 'firebase-admin/firestore';
import type { Caller } from './actorAuth.js';
import { BOOKS_COLLECTION, FEEDERS, parseBookCall, type BookCall } from './corpTaxBook.js';
import { syncOneFeeder, type CorpSyncDeps } from './corpSyncGrant.js';
import { bookDeps } from './corpTaxBookFeederGrant.js';
import { FeederStorm, READABLE_FEEDER_STATUSES } from './corpTaxBookFeederSync.js';
import { requireToken } from './corpTaxBookOwnFeeder.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';
import { authorizeOfficer } from './corpTaxBookStore.js';

/** One manual read per book in this long. */
export const MOON_OWNERS_SYNC_NOW_REST_MS = 10 * 60_000;

/** Server-only (no rule opens it): when each book last pressed Sync now for its moon owners. */
export const MOON_OWNERS_SYNC_NOW_COLLECTION = 'corpTaxBookMoonOwnersSyncNow';

/** No pull starts after this long into the call, well inside the router's 120 s limit. */
const START_BUDGET_MS = 90_000;

export type SyncMoonOwnersNowResult =
  | { kind: 'synced'; read: number; stale: number; skipped: number }
  | { kind: 'rate-limited'; retryAt: number };

export function parseSyncMoonOwnersNowInput(data: unknown): BookCall {
  const call = parseBookCall(data);
  requireToken(call);
  return call;
}

/** Takes the book's slot, or says when the next one opens. */
async function claimSlot(
  db: Firestore,
  corporationId: number,
  now: number
): Promise<number | null> {
  const ref = db.collection(MOON_OWNERS_SYNC_NOW_COLLECTION).doc(String(corporationId));
  return db.runTransaction(async (tx) => {
    const last = (await tx.get(ref)).get('at');
    if (typeof last === 'number' && now - last < MOON_OWNERS_SYNC_NOW_REST_MS) {
      return last + MOON_OWNERS_SYNC_NOW_REST_MS;
    }
    tx.set(ref, { at: now });
    return null;
  });
}

export async function syncMoonOwnersNow(
  deps: CorpSyncDeps & { esi: SyncEsi },
  caller: Caller,
  input: BookCall
): Promise<SyncMoonOwnersNowResult> {
  await authorizeOfficer(bookDeps(deps), caller, input, 'edit', { live: true });
  const started = deps.now();
  const retryAt = await claimSlot(deps.db, input.corporationId, started);
  if (retryAt !== null) return { kind: 'rate-limited', retryAt };

  const feeders = await deps.db
    .collection(BOOKS_COLLECTION)
    .doc(String(input.corporationId))
    .collection(FEEDERS)
    .where('status', 'in', [...READABLE_FEEDER_STATUSES])
    .get();
  const result = { kind: 'synced' as const, read: 0, stale: 0, skipped: 0 };
  const storm = new FeederStorm();
  let budgetOut = false;
  for (const doc of feeders.docs) {
    const feederCorporationId = Number(doc.id);
    if (!Number.isSafeInteger(feederCorporationId)) continue;
    if (deps.now() - started >= START_BUDGET_MS) {
      result.skipped += 1;
      continue;
    }
    try {
      const one = await syncOneFeeder(
        deps,
        deps.esi,
        input.corporationId,
        feederCorporationId,
        storm,
        budgetOut || deps.esi.budgetLow()
      );
      if (one.budget) budgetOut = true;
      if (one.outcome === 'ok') result.read += 1;
      else if (one.outcome === 'stale') result.stale += 1;
      else result.skipped += 1;
    } catch (err) {
      result.skipped += 1;
      deps.log('Moon owner sync now failed', {
        feederCorporationId,
        collectorCorporationId: input.corporationId,
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return result;
}
