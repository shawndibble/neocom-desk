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
import {
  META,
  MINERS,
  PAID_DOC,
  PAYMENTS,
  STATEMENTS,
  DISMISSALS,
  EXTRACTIONS,
  OBSERVED,
  FEEDERS,
  WRITE_OFFS,
  DISPUTES,
} from './corpTaxBook.js';
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
  matchDonation,
  mergeGaps,
  observedRowsFromLedger,
  moonNotificationsOf,
  placeObservedRows,
  noteUncounted,
  openBalances,
  otherDivisions,
  planSettlements,
  reconcileExtractions,
  resolveDonations,
  billableStoredRows,
  storedRowsWanted,
  unbilledMinerIds,
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
  writeOffForAllocation,
  type AllocWriteOff,
  type HoldingDispute,
  disputeHolds,
  readHoldingDisputes,
  type MirrorDismissal,
  type ObservedRow,
  type OutgoingDonation,
} from './corpTaxBookEngine.js';
import { refreshAfterEvent } from './corpTaxBookMinerTotalsStore.js';
import { reconcileFeederPayouts } from './corpTaxBookFeederPayouts.js';
import { chunk } from './chunk.js';
import { LATE_NOTICES } from './corpTaxBook.js';
import type { LateNotice } from './corpTaxBookLateNotice.js';
import { mergeNotices } from './corpTaxBookLateNoticeStore.js';
import { recognisedCodes, withoutNotice } from './corpTaxBookPaymentCodes.js';

/** Same bounds the officer's client uses against the callable's caps (corpTaxBook.ts MAX_SYNC_*). */
export const OBSERVED_PER_CALL = 2000;
export const DONATIONS_PER_CALL = 500;
export const EXTRACTIONS_PER_CALL = 200;
export const SETTLE_PER_CALL = 200;

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
      settled: number;
      reassigned: number;
      /** Sources the holder could not read this time; the rest still synced. */
      missing: ('extractions' | 'donations')[];
      truncated: boolean;
      reassignError?: string;
    }
  | { kind: 'skipped'; reason: SkipReason }
  | { kind: 'stopped'; reason: StopReason };

/** The only edits a scheduled run may make: re-match a donation, settle Statements. */
type ScheduledAction =
  | { action: 'assignPayment'; paymentId: string; minerId: string }
  | { action: 'settleStatements'; statementIds: string[] };

interface Data {
  [key: string]: unknown;
}

export interface AdminBookState {
  startDate: string;
  divisions: number[];
  lastSync: { at: number; gaps?: SyncGap[] } | null;
  miners: (MinerLike & Data)[];
  statements: (SettleStatement & StatementLike)[];
  /** Late notices from both collections: the codes they printed still name their Miner. */
  notices: Pick<LateNotice, 'id' | 'minerId' | 'code'>[];
  payments: (SettlePayment & { characterId?: number })[];
  dismissals: MirrorDismissal[];
  extractions: SyncExtraction[];
  paidStatementIds: Set<string>;
  /** Officer write-offs (#4637): a Statement one forgives in full settles. */
  writeOffs?: (AllocWriteOff & { minerId: string })[];
  /** Members' disputes (resolving in the app): an open one holds its Statement from settling for good. */
  disputes: (HoldingDispute & { minerId: string })[];
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
 * A quiet run's state: the book doc, the extractions from the marker's cut-off on and
 * the paid ids, and none of the collections the quiet marker vouches for (they stay
 * empty: nothing on the quiet path reads them).
 */
async function readQuietBookState(
  snap: BookSnap,
  paid: BookSnap,
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
    notices: [],
    payments: [],
    dismissals: [],
    extractions: extractions.docs.map((d) => d.data() as SyncExtraction),
    paidStatementIds: paidIdsOf(paid),
    writeOffs: [],
    disputes: [],
  };
}

const paidIdsOf = (paid: BookSnap): Set<string> =>
  new Set((paid.data()?.ids as string[] | undefined) ?? []);

/** The sync's reads of the book, with the admin SDK (the client reads the same collections under the rules). */
export async function readBookStateAdmin(
  db: Firestore,
  corporationId: number
): Promise<AdminBookState | null> {
  const snap = await readActiveBook(db, corporationId);
  return snap ? readBookStateFrom(snap) : null;
}

/** `paid`: the `meta/paid` doc when the caller has just read it. */
async function readBookStateFrom(snap: BookSnap, paidRead?: BookSnap): Promise<AdminBookState> {
  const ref = snap.ref;
  const list = async <T>(name: string): Promise<T[]> =>
    (await ref.collection(name).get()).docs.map((d) => d.data() as T);
  const [
    miners,
    statementSnap,
    noticeSnap,
    payments,
    dismissals,
    extractions,
    paid,
    writeOffDocs,
    disputes,
  ] = await Promise.all([
    list<AdminBookState['miners'][number]>(MINERS),
    ref.collection(STATEMENTS).get(),
    ref.collection(LATE_NOTICES).get(),
    list<AdminBookState['payments'][number]>(PAYMENTS),
    list<MirrorDismissal>(DISMISSALS),
    list<SyncExtraction>(EXTRACTIONS),
    paidRead ?? ref.collection(META).doc(PAID_DOC).get(),
    list<Record<string, unknown>>(WRITE_OFFS),
    list<unknown>(DISPUTES),
  ]);
  return {
    ...bookDocState(snap),
    miners,
    statements: statementSnap.docs.map((d) => d.data() as AdminBookState['statements'][number]),
    notices: mergeNotices(noticeSnap, statementSnap),
    payments,
    dismissals,
    extractions,
    paidStatementIds: paidIdsOf(paid),
    disputes: readHoldingDisputes(disputes),
    writeOffs: writeOffDocs.flatMap((d) => {
      const w = writeOffForAllocation(d);
      return w && typeof d.minerId === 'string' ? [{ ...w, minerId: d.minerId }] : [];
    }),
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
  // A book unchanged since a run that had nothing to match, re-match or settle skips reading
  // its Miners, Statements and payments (corpTaxBookQuietRun.ts) — unless the ESI reads below
  // bring something new, when it reads them after all.
  const headState = bookDocState(head);
  const markerRef = head.ref.collection(META).doc(QUIET_DOC);
  const [paid, markerSnap] = await db.getAll(head.ref.collection(META).doc(PAID_DOC), markerRef);
  const marker = readQuietMarker(markerSnap.data());
  const vouching =
    quietAtStart(marker, headState, startedAt) && fingerprintOf(paidIdsOf(paid)) === marker.paid
      ? marker
      : null;
  let quiet = vouching !== null;
  let before = vouching
    ? await readQuietBookState(head, paid, vouching.extractionsSince)
    : await readBookStateFrom(head, paid);

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
  // The rows donations are matched against: this read's, and the moon owners' mining the book
  // bills, which only the stored rows hold (a quiet run matches nothing, so reads none).
  const rows: { characterId: number; date: string; quantity: number }[] = [
    ...feed.rows,
    ...(quiet ? [] : await billedStoredRows(db, corporationId, before, feed.rows, fresh, now)),
  ];
  const known = new Set<number>([
    ...rows.map((r) => r.characterId),
    ...before.miners.flatMap((m) => m.characterIds),
    ...before.payments.filter((p) => p.minerId !== undefined).map((p) => p.characterId as number),
  ]);
  const matching = {
    miners: before.miners,
    statements: codesOf(before, known),
    knownCharacterIds: known,
    openBalance: quiet ? new Map<string, number>() : openBalanceOf(before),
    unbilled: quiet ? new Set<string>() : unbilledOf(before, rows),
  };
  const resolved = resolveDonations(fresh, matching).map(withoutNotice);
  // #6207: what looks like tax paid into a division the book does not read. Only on a full run,
  // which holds the Miners and balances it rests on; a quiet one leaves the stored list as it was.
  const elsewhere = quiet
    ? null
    : await readDonationsElsewhere(esi, corporationId, before.divisions, accessToken);
  const uncounted = elsewhere === null ? undefined : noteUncounted(elsewhere, matching, resolved);

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
      donations: resolved,
      ...(uncounted ? { uncounted } : {}),
    },
    // Members' "not credited" notes wait on a sync that read the wallet, not on any sync.
    { donationsRead }
  );
  const receipt = await syncBookAs(deps, access, first, { scheduled: true });
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
  const { assigned, error: reassignError } = quiet
    ? { assigned: new Map<string, string>(), error: undefined }
    : await reassignUnmatched(edit, before, known, rows);

  // --- Settle ---------------------------------------------------------------
  // Read again, right before settling, whenever this run brought in money: a settle is never
  // undone (D22), so it plans from the book as it is now, officers' edits during the run included,
  // rather than from the copy read before the (slow) ESI reads.
  const after =
    receipt.donationsAdded > 0 || assigned.size > 0
      ? await readBookStateAdmin(db, corporationId)
      : before;
  // Quiet: the book is the one the quiet run planned from, and that plan was empty.
  const toSettle =
    after && !quiet
      ? planSettlements({
          statements: after.statements,
          payments: after.payments,
          dismissals: after.dismissals,
          alreadyPaid: after.paidStatementIds,
          extractions: after.extractions,
          ...(after.writeOffs ? { writeOffs: after.writeOffs } : {}),
          startDate: after.startDate,
          disputes: after.disputes,
          now: new Date(deps.now()).toISOString(),
        })
      : [];
  for (const ids of chunk(toSettle, SETTLE_PER_CALL)) {
    await edit({ action: 'settleStatements', statementIds: ids });
  }

  // --- Holds that lapsed ---------------------------------------------------
  // A Miner's stored totals count an open dispute's amount as not due while its hold lasts, and
  // a hold lapses with only time passing. The run after a lapse is never quiet (no marker is
  // written while a dispute holds), so it recomputes the totals of every Miner with an
  // unanswered dispute that no longer holds. Best effort: the daily verifier repairs a miss.
  if (!quiet) {
    const at = new Date(deps.now()).toISOString();
    const lapsed = new Set(
      before.disputes.filter((d) => !d.resolution && !disputeHolds(d, at)).map((d) => d.minerId)
    );
    if (lapsed.size > 0) await refreshAfterEvent(db, corporationId, [...lapsed], deps.now);
  }

  // --- Quiet marker ---------------------------------------------------------
  // A full run that had nothing to match, re-match or settle vouches for the book as it read
  // it, so the next runs can skip that read while nothing changes; any other full run clears
  // an older marker. Best effort: without a marker the next run just reads in full.
  if (!quiet) {
    const extractionsSince = extractionsSinceOf(startedAt);
    const next: QuietMarker | null =
      donationsRead &&
      fresh.length === 0 &&
      assigned.size === 0 &&
      !reassignError &&
      toSettle.length === 0 &&
      // A hold lapsing changes the plan with only time passing: no run is quiet while a dispute holds.
      !before.disputes.some((d) => disputeHolds(d, new Date(startedAt).toISOString())) &&
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
            paid: fingerprintOf(before.paidStatementIds),
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
    settled: toSettle.length,
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
  feedRows: readonly ObservedRow[],
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
  const knownCharacterIds = new Set<number>([
    ...feedRows.map((r) => r.characterId),
    ...book.miners.flatMap((m) => m.characterIds),
    ...book.payments.filter((p) => p.minerId !== undefined).map((p) => p.characterId as number),
  ]);
  const feedOnly = {
    miners: book.miners,
    statements: codesOf(book, knownCharacterIds),
    knownCharacterIds,
    openBalance: openBalanceOf(book),
    unbilled: unbilledOf(book, feedRows),
  };
  const senders = [
    ...new Set(
      fresh
        .filter((d) => {
          const match = matchDonation({ characterId: d.characterId, reason: d.reason }, feedOnly);
          return match.kind !== 'miner' && match.kind !== 'statement';
        })
        .map((d) => d.characterId)
    ),
  ];
  const wanted = storedRowsWanted({
    held,
    senders,
    miners: book.miners,
    statements: book.statements,
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

/**
 * The Reason codes a donation is matched on (`recognisedCodes`): every notice's, and the code of
 * each Miner the book knows, grouped or a known Character on their own.
 */
function codesOf(book: AdminBookState, characterIds: Iterable<number>) {
  return recognisedCodes(book.notices, [
    ...book.miners.map((m) => m.id),
    ...[...characterIds].map((c) => `solo:${c}`),
  ]);
}

/** The Miners with ore this read found that no Statement covers yet, for `matchDonation` (#6207). */
function unbilledOf(
  book: AdminBookState,
  rows: readonly { characterId: number; date: string; quantity: number }[]
): Set<string> {
  return unbilledMinerIds(rows, {
    miners: book.miners,
    statements: book.statements as { minerId: string; coversThrough?: string }[],
    startDate: book.startDate,
  });
}

/** What each Miner owes on the book's issued Statements, for `matchDonation` (#6207). */
function openBalanceOf(book: AdminBookState): Map<string, number> {
  return openBalances({
    statements: book.statements,
    payments: book.payments,
    dismissals: book.dismissals,
    extractions: book.extractions,
    ...(book.writeOffs ? { writeOffs: book.writeOffs } : {}),
    startDate: book.startDate,
  });
}

async function reassignUnmatched(
  edit: (action: ScheduledAction) => Promise<unknown>,
  before: AdminBookState,
  known: ReadonlySet<number>,
  rows: readonly { characterId: number; date: string; quantity: number }[]
): Promise<{ assigned: Map<string, string>; error?: string }> {
  const open = before.payments
    .filter((p) => p.minerId === undefined && !(p.notTaxAmount && p.notTaxAmount > 0))
    .sort((a, b) => a.at.localeCompare(b.at));
  const assigned = new Map<string, string>();
  // A sender the book knows credits their Miner, owing or not (#6300); a donation held under #6207 clears here.
  const balance = openBalanceOf(before);
  const unbilled = unbilledOf(before, rows);
  const codes = codesOf(before, known);
  try {
    for (const p of open) {
      const match = matchDonation(
        { characterId: p.characterId as number, reason: (p as { reason?: string }).reason },
        {
          miners: before.miners,
          statements: codes,
          knownCharacterIds: known,
          openBalance: balance,
          unbilled,
        }
      );
      if (match.kind !== 'miner' && match.kind !== 'statement') continue;
      await edit({ action: 'assignPayment', paymentId: p.id, minerId: match.minerId });
      balance.set(match.minerId, (balance.get(match.minerId) ?? 0) - p.amount);
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
