// The scheduled read of one feeder's mining ledger (issue #4509, spec #4504, ADR 0025).
// A feeder's grant is the ledger (`esi-industry.read_corporation_mining.v1`), plus, on grants
// from #4654 on, `esi-universe.read_structures.v1`. The ledger read is two things — the observer
// list and each refinery's ledger; a grant with the structure scope then looks up the names and
// systems of refineries not read this week. Nothing calls an endpoint the grant cannot reach
// (each 403 would burn the shared ESI error budget). Rows go into the Collector's `observed` collection tagged with the feeder's
// corporation id; the Collector book's own `lastSync` and gaps are not touched.
//
// What the read means for the feeder (the pure rules are corpTaxBookEngine.ts's
// `advanceFeederHealth`): a refusal (403, dead token, lost role) marks it stale, a read
// that lands clears that, and 30 days stale disconnects it. Nothing here logs or
// returns a token.

import { FieldPath, FieldValue, type Firestore } from 'firebase-admin/firestore';
import { BOOKS_COLLECTION, FEEDERS, REMOVAL_LINKS_COLLECTION } from './corpTaxBook.js';
import { isMissingIndex, isTopLevelChild } from './indexedSweep.js';
import {
  BOOK_DEFAULTS,
  advanceFeederHealth,
  disconnectedCoverage,
  type FeederHealth,
  type FeederReadOutcome,
  type ObservedRow,
} from './corpTaxBookEngine.js';
import type { FeederRecord, RefineryStructureDoc } from './corpTaxBookFeeders.js';
import {
  SCHEDULED_VIA,
  appendAudit,
  bookRef,
  feederRef,
  type BookDeps,
} from './corpTaxBookStore.js';
import { observedRowsFromLedger } from './corpTaxBookSyncEngine.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';

/** A refinery's name is re-read, or a refused lookup retried, after this long (#4654). */
export const STRUCTURE_RECHECK_MS = 7 * 24 * 3_600_000;
/** The most structure lookups one feeder's run makes; the rest wait for the next run. */
export const MAX_STRUCTURE_LOOKUPS = 20;

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

/** The refineries to look up this run: new ones, and those last read or refused a week ago. */
export function structuresToLookUp(
  structureIds: Iterable<number>,
  cached: Readonly<Record<string, RefineryStructureDoc>> | undefined,
  now: number
): number[] {
  const out: number[] = [];
  for (const id of new Set(structureIds)) {
    if (out.length >= MAX_STRUCTURE_LOOKUPS) break;
    const known = cached?.[String(id)];
    if (!known || now - known.checkedAt >= STRUCTURE_RECHECK_MS) out.push(id);
  }
  return out;
}

/**
 * Each refinery's name and system, with the moon owner's own token. A 403 or 404 is remembered
 * as refused; an unanswered lookup is not kept (the next run tries again); a 420/429 or a low
 * shared budget stops it. Never touches the feeder's health.
 */
export async function lookUpRefineryStructures(
  esi: SyncEsi,
  structureIds: readonly number[],
  accessToken: string,
  now: number
): Promise<Record<string, RefineryStructureDoc>> {
  const found: Record<string, RefineryStructureDoc> = {};
  for (const id of structureIds) {
    if (esi.budgetLow()) break;
    const read = await esi.structure(id, accessToken);
    if (read.kind === 'backoff') break;
    if (read.kind === 'ok') {
      found[String(id)] = { name: read.name, solarSystemId: read.solarSystemId, checkedAt: now };
    } else if (read.kind === 'denied') {
      found[String(id)] = { checkedAt: now, denied: true };
    }
  }
  return found;
}

/**
 * After a good ledger read: look up the refineries that need it (only when the grant carries the
 * structure scope) and keep them on the record, with whether the grant reads names at all. Best
 * effort: a failure here is logged by the caller and never fails the read.
 */
export async function refreshRefineryStructures(
  deps: BookDeps,
  esi: SyncEsi,
  collectorCorporationId: number,
  feederCorporationId: number,
  structureIds: Iterable<number>,
  accessToken: string,
  readsStructures: boolean
): Promise<void> {
  const ref = feederRef(deps.db, collectorCorporationId, feederCorporationId);
  const record = (await ref.get()).data() as FeederRecord | undefined;
  if (!record) return;
  const now = deps.now();
  const found = readsStructures
    ? await lookUpRefineryStructures(
        esi,
        structuresToLookUp(structureIds, record.refineryStructures, now),
        accessToken,
        now
      )
    : {};
  const fields = Object.entries(found);
  if (fields.length === 0 && record.readsStructureNames === readsStructures) return;
  await deps.db.runTransaction(async (tx) => {
    const latest = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!latest || !READABLE_FEEDER_STATUSES.includes(latest.status)) return;
    const pairs: unknown[] = [];
    for (const [id, doc] of fields) pairs.push(new FieldPath('refineryStructures', id), doc);
    tx.update(ref, 'readsStructureNames', readsStructures, ...pairs);
  });
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

export interface FeederReadResult {
  status: 'active' | 'disconnected';
  /**
   * False when the read moved nothing the moon owner's view or the miners' coverage shows: a
   * skip, or another refusal in a spell already stale. Those need no rebuild.
   */
  viewChanged: boolean;
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
): Promise<FeederReadResult | null> {
  const ref = feederRef(deps.db, collectorCorporationId, feederCorporationId);
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
      // A removal pending at the disconnect ends with it: its strip and its link would go stale.
      update.removal = FieldValue.delete();
      update.removalLinkId = FieldValue.delete();
      if (record.removalLinkId) {
        tx.delete(deps.db.collection(REMOVAL_LINKS_COLLECTION).doc(record.removalLinkId));
      }
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
    const staleMoved = (record.staleSince === undefined) !== (next.staleSince === undefined);
    return {
      status: next.status,
      // A good read moves `lastReadWellAt`, so which days are Billable.
      viewChanged: read.outcome === 'ok' || next.status === 'disconnected' || staleMoved,
    };
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

export interface ReadableFeeder {
  feederCorporationId: number;
  collectorCorporationId: number;
  /** The record as the query saw it; absent on the pointer fallback. */
  record?: FeederRecord;
}

/**
 * The feeders a run still reads: one collection-group query over the records whose status is
 * readable, not every pointer and then every record. Disconnected, left and removed feeders
 * cost nothing. Until its index is deployed (indexes go out by hand) the query fails and the
 * run falls back to the pointer scan, whose records the caller reads itself.
 */
export async function readableFeeders(
  db: Firestore,
  pointerCollection: string,
  log: (message: string, detail?: Record<string, unknown>) => void
): Promise<ReadableFeeder[]> {
  try {
    const snap = await db
      .collectionGroup(FEEDERS)
      .where('status', 'in', [...READABLE_FEEDER_STATUSES])
      .get();
    return snap.docs.flatMap((d) => {
      if (!isTopLevelChild(d, BOOKS_COLLECTION)) return [];
      const collector = Number(d.ref.parent.parent!.id);
      const feeder = Number(d.id);
      return Number.isSafeInteger(collector) && Number.isSafeInteger(feeder)
        ? [
            {
              feederCorporationId: feeder,
              collectorCorporationId: collector,
              record: d.data() as FeederRecord,
            },
          ]
        : [];
    });
  } catch (err) {
    if (!isMissingIndex(err)) throw err;
    log('Collection-group index not deployed yet; using the pointer scan', {
      sweep: 'runFeederSyncs',
    });
  }
  return feedersToRead(db, pointerCollection);
}
