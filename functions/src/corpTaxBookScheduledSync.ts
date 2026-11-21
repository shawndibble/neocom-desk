// One scheduled sync of one corporation's Corp Tax Book (issue #4068, ADR 0025):
// the server-side twin of the officer visit in src/features/corp/taxBook/
// syncCorpTaxBook.ts. It reads what ESI holds with the grant holder's token,
// uploads it monotonically, records the gaps, re-matches Unmatched donations
// and settles the Statements the donations now cover — through the same
// `syncBookAs` / `editBookAs` the callables use, so the audit log and
// `lastSync` read as they do for a visit. The pure decisions are the mirror in
// corpTaxBookSyncEngine.ts.
//
// What it must never do is issue a Statement or send mail; those stay officer
// actions. That is enforced by what this file imports (no issuing helper) and by
// `ScheduledAction`, the only edits it can ask for. It also does not group the
// officer's own Characters (that needs the officer's device).

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
  type SettleStatement,
  type StatementLike,
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
import { dbReader, readNoticeDocs } from './corpTaxBookLateNoticeStore.js';
import {
  donationOwner,
  noteUncountedDonations,
  type MatchBook,
} from './corpTaxBookDonationMatch.js';
import { loadMatchBook } from './corpTaxBookDonationMatchStore.js';
import { billableStoredRows, minedSinceStart, storedRowsWanted } from './corpTaxBookMatchRows.js';

/** Same bounds the officer's client uses against the callable's caps (corpTaxBook.ts MAX_SYNC_*). */
export const OBSERVED_PER_CALL = 2000;
export const DONATIONS_PER_CALL = 500;
export const EXTRACTIONS_PER_CALL = 200;

/** Why the schedule for a corporation stopped; the health strip words each of these. */
export type StopReason = (typeof SCHEDULED_STOP_REASONS)[number];

/**
 * `esi-refused`: ESI refused the holder's token on the observer list or a ledger
 * even though the role check passed. One refusal skips the run; the same one on
 * the next run stops the schedule (`runOne`).
 */
export type SkipReason = 'esi-unavailable' | 'esi-budget' | 'esi-refused' | 'no-refineries';

export type BookSyncResult =
  | {
      kind: 'synced';
      observedRows: number;
      extractions: number;
      donationsAdded: number;
      reassigned: number;
      /** Sources the holder could not read this time; the rest still synced. */
      missing: ('extractions' | 'donations')[];
      truncated: boolean;
      reassignError?: string;
    }
  | { kind: 'skipped'; reason: SkipReason }
  | { kind: 'stopped'; reason: StopReason };

/** The only edit a scheduled run may make: re-match a donation. */
type ScheduledAction = { action: 'assignPayment'; paymentId: string; minerId: string };

interface Data {
  [key: string]: unknown;
}

export interface AdminBookState {
  startDate: string;
  divisions: number[];
  lastSync: { at: number; gaps?: SyncGap[] } | null;
  miners: (MinerLike & Data)[];
  statements: (SettleStatement & StatementLike)[];
  payments: (SettlePayment & { characterId?: number })[];
  extractions: SyncExtraction[];
  /** Per refinery, the last read merged in full: which rows are final (corpTaxBookObservedThrough.ts). */
  observedThrough: ObservedThrough;
  /** The book doc's `createdAt`: tells this book from one deleted and turned on again. */
  createdAt: unknown;
  /** The stamps of the collections read here, as the book doc showed them first (corpTaxBookQuietRun.ts). */
  versions: Record<string, string> | null;
}

type BookSnap = DocumentSnapshot;

/** The book doc's part of the state; `readBookStateAdmin` adds the collections. */
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

/**
 * A quiet run's state: the book doc and the extractions from the marker's cut-off on, and none of
 * the collections the quiet marker vouches for (they stay empty: nothing on the quiet path reads
 * them).
 */
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
    statements: [],
    payments: [],
    extractions: extractions.docs.map((d) => d.data() as SyncExtraction),
  };
}

/** The sync's reads of the book, with the admin SDK (the client reads the same collections under the rules). */
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
  const [miners, statements, payments, extractions] = await Promise.all([
    list<AdminBookState['miners'][number]>(MINERS),
    readNoticeDocs(dbReader(ref.firestore), ref),
    list<AdminBookState['payments'][number]>(PAYMENTS),
    list<SyncExtraction>(EXTRACTIONS),
  ]);
  return {
    ...bookDocState(snap),
    miners,
    statements: statements as unknown as AdminBookState['statements'],
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
  /** The role check made with the holder's token this run; never persisted. */
  access: OfficerAccess;
  accessToken: string;
  corporationId: number;
  /**
   * Whether the grant this run started under is still the one held. Checked once the
   * ESI reads are in and before anything is written, so a revoke or replacement that
   * landed during the (slow) reads does not leave the old holder writing.
   */
  stillHeld: () => Promise<boolean>;
  /** Refinery → solar system, remembered from earlier runs. */
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
  // A book unchanged since a run that had nothing to match or re-match skips reading its Miners,
  // notices and payments (corpTaxBookQuietRun.ts) — unless the ESI reads below bring something
  // new, when it reads them after all.
  const headState = bookDocState(head);
  const markerRef = head.ref.collection(META).doc(QUIET_DOC);
  const markerSnap = await markerRef.get();
  const marker = readQuietMarker(markerSnap.data());
  const vouching = quietAtStart(marker, headState, startedAt) ? marker : null;
  let quiet = vouching !== null;
  let before = vouching
    ? await readQuietBookState(head, vouching.extractionsSince)
    : await readBookStateFrom(head);

  // --- ESI reads (nothing is written until all of them are in) -------------
  const observers = await esi.observers(corporationId, accessToken);
  if (observers.kind === 'forbidden') return { kind: 'skipped', reason: 'esi-refused' };
  if (observers.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
  if (observers.kind !== 'ok') return { kind: 'skipped', reason: 'esi-unavailable' };
  // An empty list is not a successful sync (decision 20261020-103802), unless the book has
  // moon owners: then its own refineries are not what it reads, and the journal, settling
  // and payouts still run (#4616).
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
    // A refinery that did not answer is a missing read, not an empty ledger: abandon the run.
    if (ledger.kind !== 'ok') return { kind: 'skipped', reason: 'esi-unavailable' };
    const rows = observedRowsFromLedger(structureId, ledger.data, ledger.fetchedAt, corporationId);
    feed.rows.push(...rows);
    feed.truncated ||= ledger.truncated;
    ledgerReads.push({ structureId, fetchedAt: ledger.fetchedAt, truncated: ledger.truncated });
    feed.oldestEsiDate[structureId] = rows.map((r) => r.date).sort()[0];

    // Remembered, else what stored rows already carry (an officer's visit set it), else ask ESI:
    // a row written without it would replace one that had it (quantity grows, the row is swapped).
    const known =
      args.systemHints[structureId] ?? (await storedSystem(db, corporationId, structureId));
    if (known !== undefined) {
      systemIds[structureId] = known;
    } else {
      const system = await esi.structureSystem(structureId, accessToken);
      if (system.kind === 'ok') systemIds[structureId] = system.data;
    }
  }

  const missing: ('extractions' | 'donations')[] = [];
  const canExtract = access.isStationManager;
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

  // --- Decide ---------------------------------------------------------------
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
  // Quiet: every donation is one the quiet run saw stored (quietAfterReads).
  const fresh = (quiet ? [] : donations)
    .filter((d) => !stored.has(paymentId(d)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DONATIONS_PER_CALL);
  // #6207: what looks like tax paid into a division the book does not read. Only on a full run,
  // which holds the Miners and balances it rests on; a quiet one leaves the stored list as it was.
  const elsewhere = quiet
    ? null
    : await readDonationsElsewhere(esi, corporationId, before.divisions, accessToken);
  // Whose money each donation is (corpTaxBookDonationMatch.ts), for every sender this run decides
  // on: its new donations, those elsewhere, and the Unmatched ones it re-matches. A quiet run
  // matches nothing, so reads none of it.
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
  // The rows donations are matched against: this read's, and the moon owners' mining the book
  // bills, which only the stored rows hold.
  const rows: { characterId: number; date: string; quantity: number }[] = [
    ...feed.rows,
    ...(book ? await billedStoredRows(db, corporationId, before, book, fresh, now) : []),
  ];
  // Every Character the run knew, for the quiet marker: one new to it could match a donation.
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
  // Rows a full earlier read already merged at their final quantity would write nothing:
  // leave them out of the merge and its per-row reads. They still refresh the billed-by
  // pointers, which record that this sync saw the Character.
  const settled: ObservedRow[] = [];
  const toMerge: ObservedRow[] = [];
  for (const r of placed) (isSettledRow(r, before.observedThrough) ? settled : toMerge).push(r);
  const batches = chunk(toMerge, OBSERVED_PER_CALL);
  const extraCalls = chunk(extractions, EXTRACTIONS_PER_CALL);

  if (!(await args.stillHeld())) return { kind: 'skipped', reason: 'esi-unavailable' };

  // --- Upload (the first call carries everything but the overflow) ----------
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
    // Members' "not credited" notes wait on a sync that read the wallet, not on any sync.
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
  // Only now, with every row of this run merged: a failed merge above leaves the
  // watermark where it was, so the next run merges those rows again.
  const observedThrough = advanceObservedThrough(before.observedThrough, ledgerReads);
  if (!isDeepStrictEqual(observedThrough, before.observedThrough)) {
    await db.runTransaction(async (tx) => {
      const ref = bookRef(db, corporationId);
      const held = await tx.get(ref);
      // A book deleted and turned on again during the run starts with no rows: it must not
      // inherit the old book's watermark, or its closed days would never be merged.
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

  // --- Re-match Unmatched donations -----------------------------------------
  // Quiet: the quiet run re-matched nothing, and no Unmatched donation or known Character is new.
  const { assigned, error: reassignError } = book
    ? await reassignUnmatched(edit, before, book)
    : { assigned: new Map<string, string>(), error: undefined };

  // --- Quiet marker ---------------------------------------------------------
  // A full run that had nothing to match or re-match vouches for the book as it read
  // it, so the next runs can skip that read while nothing changes; any other full run clears
  // an older marker. Best effort: without a marker the next run just reads in full.
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

  // --- Moon owner payouts: what the wallet sent, attached to what was recorded --------
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

/**
 * Donations into every wallet division the book does not read (#6207), or null unless each one
 * answered: the stored list is replaced, so an unread division must not read as an empty one.
 */
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

/** Stored rows read per run at most: one query per Character, so the read stays bounded. */
const STORED_ROWS_CHARACTERS = 50;
/** The scheduled sync's interval: each run starts the capped reads one window further on. */
const STORED_ROWS_ROTATION_MS = 2 * 60 * 60 * 1000;

/**
 * The stored rows the book bills that a held or would-be-held donation is matched against
 * (`storedRowsWanted`): its moon owners' mining, which this run's ledger read never holds. Without
 * them a Miner who mined only at a moon owner's refinery owes nothing as far as the run can see,
 * and their donation is held for review for good. Read only for the Characters those donations'
 * Miners hold, from the first day that can count; none when nothing is held and every new donation
 * already matches. Best effort: a failed read leaves the hold for the next run.
 */
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
    // A row mined after the last of these payments can never count toward one of them.
    const through = [...held.map((p) => p.at), ...fresh.map((d) => d.at)]
      .map((at) => at.slice(0, 10))
      .reduce((a, b) => (b > a ? b : a), '');
    // Past the cap, each run starts further along the list, so no Character's hold is never read.
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
  book: MatchBook
): Promise<{ assigned: Map<string, string>; error?: string }> {
  // One an officer has to place (ambiguous) waits for them; nothing places it automatically.
  const open = before.payments
    .filter(
      (p) =>
        p.minerId === undefined &&
        !(p.notTaxAmount && p.notTaxAmount > 0) &&
        (p as { reviewReason?: string }).reviewReason !== 'ambiguous'
    )
    .sort((a, b) => a.at.localeCompare(b.at));
  const assigned = new Map<string, string>();
  // A sender the book knows credits their Miner, owing or not (#6300); a donation held under #6207 clears here.
  try {
    for (const p of open) {
      const match = donationOwner(
        { characterId: p.characterId as number, reason: (p as { reason?: string }).reason },
        book
      );
      if (match.kind !== 'miner') continue;
      await edit({ action: 'assignPayment', paymentId: p.id, minerId: match.minerId });
      assigned.set(p.id, match.minerId);
    }
    return { assigned };
  } catch (e) {
    // A failed re-match is not the sync's: report it, the next run tries again.
    return { assigned, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Whether the book holds any moon owner record, current or past (payouts to a past one still reconcile). */
async function hasMoonOwners(db: Firestore, corporationId: number): Promise<boolean> {
  const snap = await bookRef(db, corporationId).collection(FEEDERS).limit(1).get();
  return !snap.empty;
}

/** The system a refinery's stored rows already carry, if any. */
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
