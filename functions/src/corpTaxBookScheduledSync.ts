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

import type { Firestore } from 'firebase-admin/firestore';
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
} from './corpTaxBook.js';
import {
  SCHEDULED_VIA,
  bookRef,
  editBookAs,
  syncBookAs,
  type BookDeps,
} from './corpTaxBookStore.js';
import type { SyncEsi } from './corpTaxBookSyncEsi.js';
import {
  detectGaps,
  donationsFromJournal,
  MOON_NOTIFICATION_TYPES,
  SCHEDULED_STOP_REASONS,
  matchDonation,
  mergeGaps,
  observedRowsFromLedger,
  parseMoonPayload,
  placeObservedRows,
  planSettlements,
  reconcileExtractions,
  resolveDonations,
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
  type MirrorDismissal,
  type ObservedRow,
  type OutgoingDonation,
} from './corpTaxBookEngine.js';
import { reconcileFeederPayouts } from './corpTaxBookFeederPayouts.js';

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
  payments: (SettlePayment & { characterId?: number })[];
  dismissals: MirrorDismissal[];
  extractions: SyncExtraction[];
  paidStatementIds: Set<string>;
}

/** The sync's reads of the book, with the admin SDK (the client reads the same collections under the rules). */
export async function readBookStateAdmin(
  db: Firestore,
  corporationId: number
): Promise<AdminBookState | null> {
  const ref = bookRef(db, corporationId);
  const snap = await ref.get();
  if (!snap.exists || snap.get('active') !== true) return null;
  const list = async <T>(name: string): Promise<T[]> =>
    (await ref.collection(name).get()).docs.map((d) => d.data() as T);
  const [miners, statements, payments, dismissals, extractions, paid] = await Promise.all([
    list<AdminBookState['miners'][number]>(MINERS),
    list<AdminBookState['statements'][number]>(STATEMENTS),
    list<AdminBookState['payments'][number]>(PAYMENTS),
    list<MirrorDismissal>(DISMISSALS),
    list<SyncExtraction>(EXTRACTIONS),
    ref.collection(META).doc(PAID_DOC).get(),
  ]);
  const data = snap.data() as Data;
  return {
    startDate: String(data.startDate ?? ''),
    divisions: Array.isArray(data.divisions) ? (data.divisions as number[]) : [1],
    lastSync: (data.lastSync as AdminBookState['lastSync'] | undefined) ?? null,
    miners,
    statements,
    payments,
    dismissals,
    extractions,
    paidStatementIds: new Set((paid.data()?.ids as string[] | undefined) ?? []),
  };
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const MOON_TYPES: ReadonlySet<string> = new Set(MOON_NOTIFICATION_TYPES);

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

  const before = await readBookStateAdmin(db, corporationId);
  if (!before) return { kind: 'stopped', reason: 'book-off' };

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
  for (const structureId of observers.data) {
    const ledger = await esi.ledger(corporationId, structureId, accessToken);
    if (ledger.kind === 'forbidden') return { kind: 'skipped', reason: 'esi-refused' };
    if (ledger.kind === 'backoff') return { kind: 'skipped', reason: 'esi-budget' };
    // A refinery that did not answer is a missing read, not an empty ledger: abandon the run.
    if (ledger.kind !== 'ok') return { kind: 'skipped', reason: 'esi-unavailable' };
    const rows = observedRowsFromLedger(structureId, ledger.data, ledger.fetchedAt, corporationId);
    feed.rows.push(...rows);
    feed.truncated ||= ledger.truncated;
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
      notifications = notes.data
        .filter((n) => MOON_TYPES.has(n.type) && typeof n.text === 'string')
        .map((n) => ({
          type: n.type,
          timestamp: n.timestamp,
          payload: parseMoonPayload(n.text!),
        }));
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

  const known = new Set<number>([
    ...feed.rows.map((r) => r.characterId),
    ...before.miners.flatMap((m) => m.characterIds),
    ...before.payments.filter((p) => p.minerId !== undefined).map((p) => p.characterId as number),
  ]);
  const stored = new Set(before.payments.map((p) => p.id));
  const fresh = donations
    .filter((d) => !stored.has(paymentId(d)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, DONATIONS_PER_CALL);
  const resolved = resolveDonations(fresh, {
    miners: before.miners,
    statements: before.statements,
    knownCharacterIds: known,
  });

  const placed = placeObservedRows(
    feed.rows,
    extractions.length > 0 ? extractions : before.extractions,
    systemIds
  );
  const batches = chunks(placed, OBSERVED_PER_CALL);
  const extraCalls = chunks(extractions, EXTRACTIONS_PER_CALL);

  if (!(await args.stillHeld())) return { kind: 'skipped', reason: 'esi-unavailable' };

  // --- Upload (the first call carries everything but the overflow) ----------
  const call = (part: Partial<Record<'observed' | 'extractions' | 'donations', unknown[]>>) =>
    parseSyncInput({ corporationId, gaps, ...part }, now);
  const first = call({
    observed: batches.shift() ?? [],
    extractions: extraCalls.shift() ?? [],
    donations: resolved,
  });
  const receipt = await syncBookAs(deps, access, first, { scheduled: true });
  for (const observed of batches) {
    await syncBookAs(deps, access, call({ observed }), { scheduled: true });
  }
  for (const rest of extraCalls) {
    await syncBookAs(deps, access, call({ extractions: rest }), { scheduled: true });
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
  const { assigned, error: reassignError } = await reassignUnmatched(edit, before, known);

  // --- Settle ---------------------------------------------------------------
  const after =
    receipt.donationsAdded > 0 || assigned > 0
      ? await readBookStateAdmin(db, corporationId)
      : before;
  const toSettle = after
    ? planSettlements({
        statements: after.statements,
        payments: after.payments,
        dismissals: after.dismissals,
        alreadyPaid: after.paidStatementIds,
        extractions: after.extractions,
        startDate: after.startDate,
      })
    : [];
  for (const ids of chunks(toSettle, SETTLE_PER_CALL)) {
    await edit({ action: 'settleStatements', statementIds: ids });
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
    reassigned: assigned,
    missing,
    truncated: feed.truncated,
    ...(reassignError ? { reassignError } : {}),
    systemIds,
  };
}

async function reassignUnmatched(
  edit: (action: ScheduledAction) => Promise<unknown>,
  before: AdminBookState,
  known: ReadonlySet<number>
): Promise<{ assigned: number; error?: string }> {
  const unmatched = before.payments.filter(
    (p) => p.minerId === undefined && !(p.notTaxAmount && p.notTaxAmount > 0)
  );
  let assigned = 0;
  try {
    for (const p of unmatched) {
      const match = matchDonation(
        { characterId: p.characterId as number, reason: (p as { reason?: string }).reason },
        { miners: before.miners, statements: before.statements, knownCharacterIds: known }
      );
      if (match.kind === 'unmatched') continue;
      await edit({ action: 'assignPayment', paymentId: p.id, minerId: match.minerId });
      assigned += 1;
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
