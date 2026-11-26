import { utcDay } from './timeConstants.js';
import { isDeepStrictEqual } from 'node:util';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { parseEditAction, parseSyncInput, type OfficerAccess } from './corpTaxBook.js';
import { META, MINERS, PAYMENTS, EXTRACTIONS, OBSERVED, FEEDERS } from './corpTaxBook.js';
import {
  SCHEDULED_VIA,
  bookRef,
  editBookAs,
  syncBookAs,
  writeBilledByPointers,
  type BookDeps,
} from './corpTaxBookStore.js';
import {
  advanceObservedThrough,
  isSettledRow,
  readObservedThrough,
  type LedgerRead,
  type ObservedThrough,
} from './corpTaxBookObservedThrough.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';
import {
  QUIET_DOC,
  extractionsSinceOf,
  fingerprintOf,
  inExtractionWindow,
  journalThroughOf,
  quietAfterReads,
  quietAtStart,
  quietVersionsOf,
  readQuietMarker,
  type QuietMarker,
} from './corpTaxBookQuietRun.js';
import {
  detectGaps,
  donationsFromJournal,
  SCHEDULED_STOP_REASONS,
  mergeGaps,
  observedRowsFromLedger,
  moonNotificationsOf,
  placeObservedRows,
  otherDivisions,
  reconcileExtractions,
  type JournalDonation,
  type MinerLike,
  type MoonNotification,
  type SettlePayment,
  type SyncExtraction,
  type SyncGap,
} from './corpTaxBookSyncEngine.js';
import {
  outgoingDonationsFromJournal,
  type ObservedRow,
  type OutgoingDonation,
} from './corpTaxBookEngine.js';
import { reconcileFeederPayouts } from './corpTaxBookFeederPayouts.js';
import { chunk } from './chunk.js';
import {
  donationOwner,
  noteUncountedDonations,
  rematchUnmatched,
  type MatchBook,
  type UnmatchedCandidate,
} from './corpTaxBookDonationMatch.js';
import { loadMatchBook } from './corpTaxBookDonationMatchStore.js';
import { billableStoredRows, minedSinceStart, storedRowsWanted } from './corpTaxBookMatchRows.js';

export const OBSERVED_PER_CALL = 2000;
export const DONATIONS_PER_CALL = 500;
export const EXTRACTIONS_PER_CALL = 200;

export type StopReason = (typeof SCHEDULED_STOP_REASONS)[number];

export type ScheduledMissingSource = 'extractions' | 'donations' | 'ore';

export type SkipReason = 'esi-unavailable' | 'esi-budget' | 'esi-refused' | 'no-refineries';

export type BookSyncResult =
  | {
      kind: 'synced';
      observedRows: number;
      extractions: number;
      donationsAdded: number;
      reassigned: number;
      missing: ScheduledMissingSource[];
      truncated: boolean;
      reassignError?: string;
    }
  | { kind: 'skipped'; reason: SkipReason }
  | { kind: 'stopped'; reason: StopReason };

type ScheduledAction = { action: 'assignPayment'; paymentId: string; minerId: string };

interface Data {
  [key: string]: unknown;
}

export interface AdminBookState {
  startDate: string;
  divisions: number[];
  lastSync: { at: number; gaps?: SyncGap[] } | null;
  miners: (MinerLike & Data)[];
  payments: (SettlePayment & { characterId?: number })[];
  extractions: SyncExtraction[];
  observedThrough: ObservedThrough;
  createdAt: unknown;
  versions: Record<string, string> | null;
}

type BookSnap = DocumentSnapshot;

function bookDocState(snap: BookSnap) {
  const data = snap.data() as Data;
  return {
    startDate: String(data.startDate ?? ''),
    divisions: Array.isArray(data.divisions) ? (data.divisions as number[]) : [1],
    lastSync: (data.lastSync as AdminBookState['lastSync'] | undefined) ?? null,
    observedThrough: readObservedThrough(data.observedThrough),
    createdAt: data.createdAt,
    versions: quietVersionsOf(data),
  };
}

async function readActiveBook(db: Firestore, corporationId: number): Promise<BookSnap | null> {
  const snap = await bookRef(db, corporationId).get();
  return snap.exists && snap.get('active') === true ? snap : null;
}

async function readQuietBookState(
  snap: BookSnap,
  extractionsSince: string
): Promise<AdminBookState> {
  const extractions = await snap.ref
    .collection(EXTRACTIONS)
    .where('chunkArrivalTime', '>=', extractionsSince)
    .get();
  return {
    ...bookDocState(snap),
    miners: [],
    payments: [],
    extractions: extractions.docs.map((d) => d.data() as SyncExtraction),
  };
}

export async function readBookStateAdmin(
  db: Firestore,
  corporationId: number
): Promise<AdminBookState | null> {
  const snap = await readActiveBook(db, corporationId);
  return snap ? readBookStateFrom(snap) : null;
}

async function readBookStateFrom(snap: BookSnap): Promise<AdminBookState> {
  const ref = snap.ref;
  const list = async <T>(name: string): Promise<T[]> =>
    (await ref.collection(name).get()).docs.map((d) => d.data() as T);
  const [miners, payments, extractions] = await Promise.all([
    list<AdminBookState['miners'][number]>(MINERS),
    list<AdminBookState['payments'][number]>(PAYMENTS),
    list<SyncExtraction>(EXTRACTIONS),
  ]);
  return {
    ...bookDocState(snap),
    miners,
    payments,
    extractions,
  };
}

const paymentId = (d: JournalDonation) => `j${d.division}_${d.refId}`;

interface Feed {
  rows: ObservedRow[];
  structureIds: number[];
  oldestEsiDate: Record<number, string | undefined>;
  truncated: boolean;
}

export interface RunBookSyncArgs {
  deps: BookDeps;
  esi: SyncEsi;
  access: OfficerAccess;
  accessToken: string;
  corporationId: number;
  stillHeld: () => Promise<boolean>;
  systemHints: Readonly<Record<number, number>>;
}

export async function runBookSync(
  args: RunBookSyncArgs
): Promise<BookSyncResult & { systemIds?: Record<number, number> }> {
  const { deps, esi, access, accessToken, corporationId } = args;
  const { db } = deps;

  const startedAt = deps.now();
  const head = await readActiveBook(db, corporationId);
  if (!head) return { kind: 'stopped', reason: 'book-off' };
  const headState = bookDocState(head);
  const markerRef = head.ref.collection(META).doc(QUIET_DOC);
  const markerSnap = await markerRef.get();
  const marker = readQuietMarker(markerSnap.data());
  const vouching = quietAtStart(marker, headState, startedAt) ? marker : null;
  let quiet = vouching !== null;
  let before = vouching
    ? await readQuietBookState(head, vouching.extractionsSince)
    : await readBookStateFrom(head);

  const observers = await esi.observers(corporationId, accessToken);
  if (observers.kind === 'forbidden') return { kind: 'skipped', reason: 'esi-refused' };
  if (observers.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
  if (observers.kind !== 'ok') return { kind: 'skipped', reason: 'esi-unavailable' };
  if (observers.data.length === 0 && !(await hasMoonOwners(db, corporationId))) {
    return { kind: 'skipped', reason: 'no-refineries' };
  }

  const feed: Feed = {
    rows: [],
    structureIds: observers.data,
    oldestEsiDate: {},
    truncated: observers.truncated,
  };
  const systemIds: Record<number, number> = {};
  const ledgerReads: LedgerRead[] = [];
  for (const structureId of observers.data) {
    const ledger = await esi.ledger(corporationId, structureId, accessToken);
    if (ledger.kind === 'forbidden') return { kind: 'skipped', reason: 'esi-refused' };
    if (ledger.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
    if (ledger.kind !== 'ok') return { kind: 'skipped', reason: 'esi-unavailable' };
    const rows = observedRowsFromLedger(structureId, ledger.data, ledger.fetchedAt, corporationId);
    feed.rows.push(...rows);
    feed.truncated ||= ledger.truncated;
    ledgerReads.push({ structureId, fetchedAt: ledger.fetchedAt, truncated: ledger.truncated });
    feed.oldestEsiDate[structureId] = rows.map((r) => r.date).sort()[0];

    const known =
      args.systemHints[structureId] ?? (await storedSystem(db, corporationId, structureId));
    if (known !== undefined) {
      systemIds[structureId] = known;
    } else {
      const system = await esi.structureSystem(structureId, accessToken);
      if (system.kind === 'ok') systemIds[structureId] = system.data;
    }
  }

  const missing: ScheduledMissingSource[] = [];
  const canExtract = access.isStationManager;
  if (!canExtract && observers.data.length > 0) missing.push('ore');
  let esiExtractions: Awaited<ReturnType<SyncEsi['extractions']>> | null = null;
  let notifications: MoonNotification[] = [];
  if (canExtract) {
    esiExtractions = await esi.extractions(corporationId, accessToken);
    if (esiExtractions.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
    if (esiExtractions.kind !== 'ok') missing.push('extractions');
    const notes = await esi.notifications(access.characterId, accessToken);
    if (notes.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
    if (notes.kind === 'ok') {
      notifications = moonNotificationsOf(notes.data);
    }
  }

  const donations: JournalDonation[] = [];
  const outgoing: OutgoingDonation[] = [];
  let donationsRead = true;
  for (const division of before.divisions) {
    const journal = await esi.journal(corporationId, division, accessToken);
    if (journal.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
    if (journal.kind === 'ok') {
      donations.push(...donationsFromJournal(journal.data, division, corporationId));
      outgoing.push(...outgoingDonationsFromJournal(journal.data, division, corporationId));
    } else {
      donationsRead = false;
    }
  }
  if (!donationsRead) missing.push('donations');

  if (
    vouching !== null &&
    !quietAfterReads(vouching, {
      donationsRead,
      donations,
      characterIds: feed.rows.map((r) => r.characterId),
      extractions: fingerprintOf(before.extractions),
    })
  ) {
    const full = await readBookStateAdmin(db, corporationId);
    if (!full) return { kind: 'stopped', reason: 'book-off' };
    before = full;
    quiet = false;
  }

  const now = deps.now();
  const gaps = mergeGaps(
    before.lastSync?.gaps ?? [],
    detectGaps({
      lastSyncAt: before.lastSync?.at ?? null,
      now,
      startDate: before.startDate,
      structureIds: feed.structureIds,
      oldestEsiDate: feed.oldestEsiDate,
    })
  );

  const extractions: SyncExtraction[] =
    canExtract && esiExtractions?.kind === 'ok'
      ? reconcileExtractions(esiExtractions.data, notifications, before.extractions)
      : [];

  const stored = new Set(before.payments.map((p) => p.id));
  const fresh = (quiet ? [] : donations)
    .filter((d) => !stored.has(paymentId(d)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DONATIONS_PER_CALL);
  const elsewhere = quiet
    ? null
    : await readDonationsElsewhere(esi, corporationId, before.divisions, accessToken);
  const book = quiet
    ? undefined
    : await loadMatchBook(
        db,
        corporationId,
        [
          ...fresh,
          ...(elsewhere ?? []),
          ...(before.payments.filter((p) => p.minerId === undefined) as {
            characterId?: number;
            reason?: string;
          }[]),
        ],
        feed.rows.map((r) => r.characterId)
      );
  const rows: { characterId: number; date: string; quantity: number }[] = [
    ...feed.rows,
    ...(book ? await billedStoredRows(db, corporationId, before, book, fresh, now) : []),
  ];
  const known = new Set<number>([
    ...rows.map((r) => r.characterId),
    ...before.miners.flatMap((m) => m.characterIds),
  ]);
  const uncounted =
    elsewhere === null || !book
      ? undefined
      : noteUncountedDonations(
          elsewhere,
          book,
          minedSinceStart(rows, before.miners, before.startDate)
        );

  const placed = placeObservedRows(
    feed.rows,
    extractions.length > 0 ? extractions : before.extractions,
    systemIds
  );
  const settled: ObservedRow[] = [];
  const toMerge: ObservedRow[] = [];
  for (const r of placed) (isSettledRow(r, before.observedThrough) ? settled : toMerge).push(r);
  const batches = chunk(toMerge, OBSERVED_PER_CALL);
  const extraCalls = chunk(extractions, EXTRACTIONS_PER_CALL);

  if (!(await args.stillHeld())) return { kind: 'skipped', reason: 'esi-unavailable' };

  const call = (
    part: Partial<Record<'observed' | 'extractions' | 'donations' | 'uncounted', unknown[]>>,
    extra: { donationsRead?: boolean } = {}
  ) => parseSyncInput({ corporationId, gaps, ...part, ...extra }, now);
  const first = call(
    {
      observed: batches.shift() ?? [],
      extractions: extraCalls.shift() ?? [],
      donations: fresh,
      ...(uncounted ? { uncounted } : {}),
    },
    { donationsRead }
  );
  const receipt = await syncBookAs(deps, access, first, {
    scheduled: true,
    ...(book ? { matchBook: book } : {}),
  });
  for (const observed of batches) {
    await syncBookAs(deps, access, call({ observed }), { scheduled: true });
  }
  for (const rest of extraCalls) {
    await syncBookAs(deps, access, call({ extractions: rest }), { scheduled: true });
  }
  if (settled.length > 0) await writeBilledByPointers(deps, corporationId, settled);
  const observedThrough = advanceObservedThrough(before.observedThrough, ledgerReads);
  if (!isDeepStrictEqual(observedThrough, before.observedThrough)) {
    await db.runTransaction(async (tx) => {
      const ref = bookRef(db, corporationId);
      const held = await tx.get(ref);
      if (!held.exists || held.get('createdAt') !== before.createdAt) return;
      tx.update(ref, { observedThrough });
    });
  }

  const edit = (action: ScheduledAction) =>
    editBookAs(
      deps,
      access,
      { corporationId },
      parseEditAction({ ...action, corporationId }),
      SCHEDULED_VIA
    );

  const { assigned, error: reassignError } = book
    ? await reassignUnmatched(edit, before, book, utcDay(deps.now()))
    : { assigned: new Map<string, string>(), error: undefined };

  if (!quiet) {
    const extractionsSince = extractionsSinceOf(startedAt);
    const next: QuietMarker | null =
      donationsRead &&
      fresh.length === 0 &&
      assigned.size === 0 &&
      !reassignError &&
      before.versions !== null
        ? {
            at: startedAt,
            createdAt: before.createdAt,
            versions: before.versions,
            startDate: before.startDate,
            divisions: before.divisions,
            journalThrough: journalThroughOf(donations),
            known: [...known].sort((x, y) => x - y),
            extractions: fingerprintOf(
              before.extractions.filter((x) => inExtractionWindow(x, extractionsSince))
            ),
            extractionsSince,
          }
        : null;
    if (next !== null || markerSnap.exists) {
      try {
        await db.runTransaction(async (tx) => {
          const held = await tx.get(bookRef(db, corporationId));
          if (!held.exists || held.get('createdAt') !== before.createdAt) return;
          if (next) tx.set(markerRef, next);
          else tx.delete(markerRef);
        });
      } catch (e) {
        console.error('quiet marker not written', e instanceof Error ? e.message : e);
      }
    }
  }

  try {
    await reconcileFeederPayouts(deps, corporationId, outgoing);
  } catch (e) {
    console.error('moon owner payouts not reconciled', e instanceof Error ? e.message : e);
  }

  return {
    kind: 'synced',
    observedRows: feed.rows.length,
    extractions: extractions.length,
    donationsAdded: receipt.donationsAdded,
    reassigned: assigned.size,
    missing,
    truncated: feed.truncated,
    ...(reassignError ? { reassignError } : {}),
    systemIds,
  };
}

async function readDonationsElsewhere(
  esi: SyncEsi,
  corporationId: number,
  divisions: readonly number[],
  accessToken: string
): Promise<JournalDonation[] | null> {
  const found: JournalDonation[] = [];
  for (const division of otherDivisions(divisions)) {
    const journal = await esi.journal(corporationId, division, accessToken);
    if (journal.kind !== 'ok') return null;
    found.push(...donationsFromJournal(journal.data, division, corporationId));
  }
  return found;
}

const STORED_ROWS_CHARACTERS = 50;
const STORED_ROWS_ROTATION_MS = 2 * 60 * 60 * 1000;

async function billedStoredRows(
  db: Firestore,
  corporationId: number,
  book: AdminBookState,
  matchBook: MatchBook,
  fresh: readonly JournalDonation[],
  now: number
): Promise<ObservedRow[]> {
  const held = book.payments.filter(
    (p) =>
      p.minerId === undefined &&
      p.reviewReason === 'no-open-balance' &&
      typeof p.characterId === 'number' &&
      !(p.notTaxAmount && p.notTaxAmount > 0)
  ) as { characterId: number; at: string }[];
  const senders = [
    ...new Set(
      fresh.filter((d) => donationOwner(d, matchBook).kind !== 'miner').map((d) => d.characterId)
    ),
  ];
  const wanted = storedRowsWanted({
    held,
    senders,
    miners: book.miners,
    startDate: book.startDate,
  });
  if (wanted.size === 0) return [];
  try {
    const ref = bookRef(db, corporationId);
    const through = [...held.map((p) => p.at), ...fresh.map((d) => d.at)]
      .map((at) => at.slice(0, 10))
      .reduce((a, b) => (b > a ? b : a), '');
    const all = [...wanted];
    const start =
      all.length > STORED_ROWS_CHARACTERS
        ? Math.floor(now / STORED_ROWS_ROTATION_MS) % all.length
        : 0;
    const reads = [...all.slice(start), ...all.slice(0, start)]
      .slice(0, STORED_ROWS_CHARACTERS)
      .map(([characterId, from]) =>
        ref
          .collection(OBSERVED)
          .where('characterId', '==', characterId)
          .where('date', '>=', from)
          .where('date', '<=', through)
          .get()
      );
    const [feeders, ...found] = await Promise.all([ref.collection(FEEDERS).get(), ...reads]);
    const coverage = feeders.docs.map((d) => ({
      corporationId: Number(d.id),
      ...(Array.isArray(d.get('coveragePeriods'))
        ? { coveragePeriods: d.get('coveragePeriods') as { from: string; to?: string }[] }
        : {}),
    }));
    const rows = found.flatMap((snap) => snap.docs.map((d) => d.data() as ObservedRow));
    return billableStoredRows(rows, wanted, corporationId, coverage);
  } catch (e) {
    console.error('stored rows not read', e instanceof Error ? e.message : e);
    return [];
  }
}

async function reassignUnmatched(
  edit: (action: ScheduledAction) => Promise<unknown>,
  before: AdminBookState,
  book: MatchBook,
  today: string
): Promise<{ assigned: Map<string, string>; error?: string }> {
  const assigned = new Map<string, string>();
  let error: string | undefined;
  for (const { paymentId, minerId } of rematchUnmatched(
    before.payments as UnmatchedCandidate[],
    book,
    today
  )) {
    try {
      await edit({ action: 'assignPayment', paymentId, minerId });
      assigned.set(paymentId, minerId);
    } catch (e) {
      error ??= e instanceof Error ? e.message : String(e);
    }
  }
  return { assigned, ...(error !== undefined ? { error } : {}) };
}

async function hasMoonOwners(db: Firestore, corporationId: number): Promise<boolean> {
  const snap = await bookRef(db, corporationId).collection(FEEDERS).limit(1).get();
  return !snap.empty;
}

async function storedSystem(
  db: Firestore,
  corporationId: number,
  structureId: number
): Promise<number | undefined> {
  const snap = await bookRef(db, corporationId)
    .collection(OBSERVED)
    .where('structureId', '==', structureId)
    .limit(20)
    .get();
  const system = snap.docs.map((d) => d.get('solarSystemId')).find((v) => typeof v === 'number');
  return system as number | undefined;
}
