import { DAY_MS } from './timeConstants.js';
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
  storedFeederExtractionKeys,
  storeFeederExtractions,
  type BookDeps,
} from './corpTaxBookStore.js';
import {
  moonNotificationsOf,
  observedRowsFromLedger,
  reconcileExtractions,
  type FeederExtraction,
  type MoonNotification,
  type StoredExtractionKey,
} from './corpTaxBookSyncEngine.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';

export const STRUCTURE_RECHECK_MS = 7 * DAY_MS;
export const MAX_STRUCTURE_LOOKUPS = 20;

export const FEEDER_FORBIDDEN_STORM = 5;

export const READABLE_FEEDER_STATUSES: readonly FeederRecord['status'][] = [
  'active',
  'pending-removal',
];

export type FeederLedgerRead =
  | { kind: 'ok'; rows: ObservedRow[]; refineries: number; truncated: boolean }
  | { kind: 'refused' }
  | { kind: 'budget' }
  | { kind: 'unavailable' };

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

export async function refreshRefineryStructures(
  deps: BookDeps,
  esi: SyncEsi,
  collectorCorporationId: number,
  feederCorporationId: number,
  structureIds: Iterable<number>,
  accessToken: string,
  { readsStructures, readsNotifications }: { readsStructures: boolean; readsNotifications: boolean }
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
  if (
    fields.length === 0 &&
    record.readsStructureNames === readsStructures &&
    record.readsNotifications === readsNotifications
  ) {
    return;
  }
  await deps.db.runTransaction(async (tx) => {
    const latest = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!latest || !READABLE_FEEDER_STATUSES.includes(latest.status)) return;
    const pairs: unknown[] = [];
    for (const [id, doc] of fields) pairs.push(new FieldPath('refineryStructures', id), doc);
    tx.update(
      ref,
      'readsStructureNames',
      readsStructures,
      'readsNotifications',
      readsNotifications,
      ...pairs
    );
  });
}

export const EXTRACTIONS_RECHECK_MS = STRUCTURE_RECHECK_MS;

export const extractionsDue = (
  record: Pick<FeederRecord, 'extractionsRefusedAt'>,
  now: number
): boolean =>
  record.extractionsRefusedAt === undefined ||
  now - record.extractionsRefusedAt >= EXTRACTIONS_RECHECK_MS;

export type FeederExtractionsRead =
  | { kind: 'ok'; extractions: FeederExtraction[]; complete: boolean }
  | { kind: 'refused' }
  | { kind: 'none' };

export async function readFeederExtractions(
  esi: SyncEsi,
  feederCorporationId: number,
  accessToken: string,
  notes: {
    notifications: readonly MoonNotification[];
    stored: readonly StoredExtractionKey[];
    now: number;
  } = { notifications: [], stored: [], now: 0 }
): Promise<FeederExtractionsRead> {
  if (esi.budgetLow()) return { kind: 'none' };
  const read = await esi.extractions(feederCorporationId, accessToken);
  if (read.kind === 'forbidden') return { kind: 'refused' };
  if (read.kind !== 'ok') return { kind: 'none' };
  return {
    kind: 'ok',
    extractions: reconcileExtractions(read.data, notes.notifications, notes.stored)
      .filter(
        (x) =>
          Date.parse(x.chunkArrivalTime) <= notes.now ||
          read.data.some(
            (e) =>
              e.structure_id === x.structureId &&
              Date.parse(e.chunk_arrival_time) === Date.parse(x.chunkArrivalTime)
          )
      )
      .map((x) => ({ ...x, sourceCorporationId: feederCorporationId })),
    complete: !read.truncated,
  };
}

export async function refreshFeederExtractions(
  deps: BookDeps,
  esi: SyncEsi,
  collectorCorporationId: number,
  record: Pick<FeederRecord, 'corporationId' | 'extractionsRefusedAt'>,
  accessToken: string,
  notificationsOf?: number
): Promise<number[]> {
  const now = deps.now();
  if (!extractionsDue(record, now)) return [];
  let notifications: MoonNotification[] = [];
  if (notificationsOf !== undefined) {
    try {
      const feed = await esi.notifications(notificationsOf, accessToken);
      if (feed.kind === 'ok') notifications = moonNotificationsOf(feed.data);
    } catch {}
  }
  const stored =
    notifications.length > 0
      ? await storedFeederExtractionKeys(deps, collectorCorporationId, record.corporationId)
      : [];
  const read = await readFeederExtractions(esi, record.corporationId, accessToken, {
    notifications,
    stored,
    now,
  });
  if (read.kind === 'none') return [];
  const refineries = read.kind === 'ok' ? read.extractions.map((x) => x.structureId) : [];
  if (read.kind === 'ok') {
    await storeFeederExtractions(
      deps,
      collectorCorporationId,
      record.corporationId,
      read.extractions,
      read.complete
    );
    if (record.extractionsRefusedAt === undefined) return refineries;
  }
  const ref = feederRef(deps.db, collectorCorporationId, record.corporationId);
  await deps.db.runTransaction(async (tx) => {
    const latest = (await tx.get(ref)).data() as FeederRecord | undefined;
    if (!latest || !READABLE_FEEDER_STATUSES.includes(latest.status)) return;
    tx.update(ref, {
      extractionsRefusedAt: read.kind === 'refused' ? now : FieldValue.delete(),
    });
  });
  return refineries;
}

export function outcomeOf(read: FeederLedgerRead): FeederReadOutcome {
  if (read.kind === 'ok') return 'ok';
  return read.kind === 'refused' ? 'stale' : 'none';
}

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
  reason?: string;
  refineries?: number;
}

export interface FeederReadResult {
  status: 'active' | 'disconnected';
  viewChanged: boolean;
}

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
    if (next.staleSince === undefined) update.staleReason = FieldValue.delete();
    else if (record.staleSince === undefined) update.staleReason = read.reason ?? 'unknown';
    if (read.outcome === 'ok') update.lastReadWellAt = now;
    if (next.status === 'disconnected') {
      const grace = Number(book.get('graceHours') ?? BOOK_DEFAULTS.graceHours);
      update.status = 'disconnected';
      update.disconnectedAt = now;
      update.coveragePeriods = disconnectedCoverage(record.coveragePeriods, next, grace);
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
      viewChanged: read.outcome === 'ok' || next.status === 'disconnected' || staleMoved,
    };
  });
}

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
  record?: FeederRecord;
}

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
