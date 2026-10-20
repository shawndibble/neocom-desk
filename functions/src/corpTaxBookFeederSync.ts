// The scheduled read of one feeder's mining ledger (issue #4509, spec #4504, ADR 0025).
// A feeder's grant is ledger-only (`esi-industry.read_corporation_mining.v1`), so this
// reads exactly two things — the observer list and each refinery's ledger — and never
// calls an endpoint that grant cannot reach (each 403 would burn the shared ESI error
// budget). Rows go into the Collector's `observed` collection tagged with the feeder's
// corporation id; the Collector book's own `lastSync` and gaps are not touched.
//
// What the read means for the feeder (the pure rules are corpTaxBookEngine.ts's
// `advanceFeederHealth`): a refusal (403, dead token, lost role) marks it stale, a read
// that lands clears that, and 30 days stale disconnects it. Nothing here logs or
// returns a token.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { FEEDERS } from './corpTaxBook.js';
import {
  BOOK_DEFAULTS,
  advanceFeederHealth,
  disconnectedCoverage,
  type FeederHealth,
  type FeederReadOutcome,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import type { FeederRecord } from './corpTaxBookFeeders.js';
import { SCHEDULED_VIA, appendAudit, bookRef, type BookDeps } from './corpTaxBookStore.js';
import { observedRowsFromLedger } from './corpTaxBookSyncEngine.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';

/** This many refusals in a row across feeders stop the run reading more of them: a 403 storm. */
export const FEEDER_FORBIDDEN_STORM = 5;

/** Feeders whose ledger is still read: not removed, left or disconnected. */
export const READABLE_FEEDER_STATUSES: readonly FeederRecord['status'][] = [
  'active',
  'pending-removal',
];

export type FeederLedgerRead =
  | { kind: 'ok'; rows: ObservedRow[]; refineries: number; truncated: boolean }
  /** ESI refused the token: revoked, role lost, holder gone. */
  | { kind: 'refused' }
  /** ESI's shared budget is low or it answered 420/429. */
  | { kind: 'budget' }
  | { kind: 'unavailable' };

/** Read every refinery's ledger for a feeder; all of it or nothing (no partial day). */
export async function readFeederLedger(
  esi: SyncEsi,
  feederCorporationId: number,
  accessToken: string
): Promise<FeederLedgerRead> {
  const observers = await esi.observers(feederCorporationId, accessToken);
  if (observers.kind === 'forbidden') return { kind: 'refused' };
  if (observers.kind === 'backoff') return { kind: 'budget' };
  if (observers.kind !== 'ok') return { kind: 'unavailable' };
  const rows: ObservedRow[] = [];
  let truncated = observers.truncated;
  for (const structureId of observers.data) {
    // The first refusal ends this feeder's read: more calls would only repeat it.
    if (esi.budgetLow()) return { kind: 'budget' };
    const ledger = await esi.ledger(feederCorporationId, structureId, accessToken);
    if (ledger.kind === 'forbidden') return { kind: 'refused' };
    if (ledger.kind === 'backoff') return { kind: 'budget' };
    if (ledger.kind !== 'ok') return { kind: 'unavailable' };
    rows.push(
      ...observedRowsFromLedger(structureId, ledger.data, ledger.fetchedAt, feederCorporationId)
    );
    truncated ||= ledger.truncated;
  }
  return { kind: 'ok', rows, refineries: observers.data.length, truncated };
}

/** The health outcome a ledger read stands for. */
export function outcomeOf(read: FeederLedgerRead): FeederReadOutcome {
  if (read.kind === 'ok') return 'ok';
  return read.kind === 'refused' ? 'stale' : 'none';
}

/** Counts refusals in a row; once it trips the rest of the run skips ESI for feeders. */
export class FeederStorm {
  private streak = 0;
  record(outcome: FeederReadOutcome): void {
    this.streak = outcome === 'stale' ? this.streak + 1 : 0;
  }
  get tripped(): boolean {
    return this.streak >= FEEDER_FORBIDDEN_STORM;
  }
}

const iso = (ms: number | undefined) => (ms === undefined ? undefined : new Date(ms).toISOString());

export interface FeederReadRecord {
  outcome: FeederReadOutcome;
  /** Why a read did not land, for the feeder's `lastSyncResult.reason`. */
  reason?: string;
  /** `synced` carries what was read. */
  refineries?: number;
}

/**
 * Write what one run found onto the feeder record and move its health: lastReadWellAt,
 * staleSince, lastSyncResult and, at 30 days stale, the disconnect (coverage ends on the
 * last fully synced day; nothing is deleted; the balance stays). Guarded on the record
 * still being readable. Returns the new status, or null when nothing was written.
 */
export async function recordFeederRead(
  deps: BookDeps,
  collectorCorporationId: number,
  feederCorporationId: number,
  read: FeederReadRecord
): Promise<'active' | 'disconnected' | null> {
  const ref = bookRef(deps.db, collectorCorporationId)
    .collection(FEEDERS)
    .doc(String(feederCorporationId));
  return deps.db.runTransaction(async (tx) => {
    const [snap, book] = await Promise.all([
      tx.get(ref),
      tx.get(bookRef(deps.db, collectorCorporationId)),
    ]);
    const record = snap.data() as FeederRecord | undefined;
    if (!record || !READABLE_FEEDER_STATUSES.includes(record.status)) return null;
    const now = deps.now();
    const prev: FeederHealth = {
      status: 'active',
      ...(record.lastReadWellAt !== undefined
        ? { lastReadWellAt: iso(record.lastReadWellAt) }
        : {}),
      ...(record.staleSince !== undefined ? { staleSince: iso(record.staleSince) } : {}),
    };
    const next = advanceFeederHealth(prev, read.outcome, new Date(now).toISOString());
    const update: Record<string, unknown> = {
      lastSyncResult: {
        at: now,
        outcome: read.outcome === 'ok' ? 'synced' : read.outcome === 'stale' ? 'stale' : 'skipped',
        ...(read.reason !== undefined ? { reason: read.reason } : {}),
      },
      staleSince: next.staleSince ? Date.parse(next.staleSince) : FieldValue.delete(),
    };
    if (read.outcome === 'ok') update.lastReadWellAt = now;
    if (next.status === 'disconnected') {
      const grace = Number(book.get('graceHours') ?? BOOK_DEFAULTS.graceHours);
      update.status = 'disconnected';
      update.disconnectedAt = now;
      update.coveragePeriods = disconnectedCoverage(record.coveragePeriods, next, grace);
      appendAudit(
        tx,
        deps,
        collectorCorporationId,
        { characterId: record.grantHolder ?? null, name: 'Scheduled sync', via: SCHEDULED_VIA },
        'feederDisconnected',
        { feederCorporationId, staleSince: record.staleSince ?? now }
      );
    }
    tx.update(ref, update);
    return next.status;
  });
}

/** The pointer records of every corporation that feeds a book (a top-level collection: no index). */
export async function feedersToRead(
  db: Firestore,
  pointerCollection: string
): Promise<{ feederCorporationId: number; collectorCorporationId: number }[]> {
  const snap = await db.collection(pointerCollection).get();
  return snap.docs.flatMap((d) => {
    const collector = d.get('collectorCorporationId');
    const feeder = Number(d.id);
    return typeof collector === 'number' && Number.isSafeInteger(feeder)
      ? [{ feederCorporationId: feeder, collectorCorporationId: collector }]
      : [];
  });
}
