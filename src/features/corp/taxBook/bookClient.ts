/**
 * The Corp Tax Book's backend as the client sees it (issue #4062, ADR 0023):
 * reads through Firestore under the officer rules, every write through the
 * callables in functions/src/corpTaxBook*.ts. The refresh token never leaves
 * Dexie; only a short-lived access token is sent, and only where the server
 * asks for one (`verifyOfficer`, and the live-role-check edits).
 *
 * Firestore here is the `lite` build (no listeners), so callers refetch after
 * a change.
 */
import { parseBookSettings, type BookSettings } from '@/engine/corpTaxBook/bookDocs';
import type { DivisionNames } from '@/engine/corpTaxBook/divisionNames';
import type { PayeeSetBy } from '@/engine/corpTaxBook/payeeChange';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
  where,
} from 'firebase/firestore/lite';
import { getValidAccessToken } from '@/auth/session';
import { popShareMarks, type PopShareMarks } from '@/engine/corpTaxBook/popShareMarks';
import { readPopSharingCached } from './popSharingCache';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/allocation';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { Declaration } from '@/engine/corpTaxBook/overdue';
import type { Adjustment, Statement } from '@/engine/corpTaxBook/statements';
import type { ToleranceExemption } from '@/engine/corpTaxBook/toleranceExemptions';
import type {
  JournalDonation,
  LastSync,
  SettlePayment,
  SyncExtraction,
  SyncGap,
} from '@/engine/corpTaxBook/sync';
import type { ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import type { UncountedDonation } from '@/engine/corpTaxBook/uncounted';
import { readDisputes, type OreDispute } from '@/engine/corpTaxBook/disputes';
import type {
  FeederMode,
  FeederModeChange,
  FeederPayout,
} from '@/engine/corpTaxBook/feederAccrual';
import type { FeederReadClock } from '@/engine/corpTaxBook/feederHealth';
import type { RemovalNoticeRecord } from '@/engine/corpTaxBook/mailQueue';
import type { OwnerRateEntry } from '@/engine/corpTaxBook/ownerRate';
import type { RefineryArchive } from '@/engine/corpTaxBook/moonOwnerRefineries';
import type { StoredRefineryLabel, StoredRefineryStructure } from '@/engine/corpTaxBook/refinery';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import type { FeederCoverage } from '@/engine/corpTaxBook/coverage';
import { getSyncFirestore } from '@/sync/firebaseApp';
import type { FeederViewSummary } from './feederViewClient';
import { openBook } from './openBook';
import type { ReadModelDocs } from '@/engine/corpTaxBook/readModels';
import { callSignedIn } from '@/sync/signedInCallable';
import { clearNotFound } from '@/sync/notFoundCache';
import { ensureSignedIn } from '@/sync/syncAuth';

/** `verifyCorpOfficerCallable`'s answer. */
export interface OfficerVerdict {
  corporationId: number;
  isCeo: boolean;
  isDirector: boolean;
  isStationManager: boolean;
  canView: boolean;
  canEdit: boolean;
  bookActive: boolean;
  expiresAt: number;
}

/** The book's settings document, the fields the sync client reads. */
export interface BookSummary {
  active: boolean;
  startDate: string;
  divisions: number[];
  /** The corp's own names for those divisions, as a Director's visit last stored them (#6161). */
  divisionNames?: DivisionNames;
  lastSync: LastSync | null;
  structureExpiryHours: Record<string, number>;
}

/** Everything the sync reads back from the book. */
export interface BookState {
  book: BookSummary;
  miners: Miner[];
  statements: Statement[];
  payments: SettlePayment[];
  dismissals: Dismissal[];
  extractions: SyncExtraction[];
  /** Statement ids settled so far (`meta/paid`), which only ever grows (D22). */
  paidStatementIds: Set<string>;
  /** Each Miner's stored paid-through day (`meta/paid`): their days up to it stay paid (D22). */
  minerPaidThrough?: Map<string, string>;
  /** Officer write-offs (#4637): they reduce what a Miner owes. */
  writeOffs?: RecordedWriteOff[];
  /** Members' disputes: an open one keeps its Statement from settling for good (resolving in the app). */
  disputes?: OreDispute[];
}

export interface SyncUpload {
  corporationId: number;
  observed?: ObservedRow[];
  extractions?: SyncExtraction[];
  donations?: JournalDonation[];
  gaps?: SyncGap[];
  /** #6207: donations noted in divisions the book does not read; replaces the stored list. */
  uncounted?: UncountedDonation[];
  /** Whether this sync read the book's divisions for donations; the first call only. */
  donationsRead?: boolean;
}

export interface SyncReceipt {
  observedChanged: number;
  extractions: number;
  donationsAdded: number;
}

/**
 * A moon owner's status and pending removal, read under the officer rules right before the send
 * queue mails a removal notice (#4621). A lapsed officer record is renewed once.
 */
export async function readFeederRemovalState(
  characterId: number,
  corporationId: number,
  feederCorporationId: number
): Promise<RemovalNoticeRecord | undefined> {
  await ensureSignedIn(characterId);
  const ref = doc(
    getSyncFirestore(characterId),
    'corps',
    String(corporationId),
    'feeders',
    String(feederCorporationId)
  );
  return asOfficer(
    characterId,
    corporationId,
    async () => (await getDoc(ref)).data() as RemovalNoticeRecord | undefined
  );
}

/** Runs an officer-rules read, renewing a lapsed officer record once on a refusal. */
async function asOfficer<T>(
  characterId: number,
  corporationId: number,
  read: () => Promise<T>
): Promise<T> {
  try {
    return await read();
  } catch (error) {
    if (!String((error as { code?: unknown }).code ?? '').endsWith('permission-denied'))
      throw error;
    await verifyOfficer(characterId, corporationId);
    return read();
  }
}

/** A Collector book's Feeder Extractions and records, for their pops off the Moons page. */
export interface FeederChunkParts {
  extractions: SyncExtraction[];
  feeders: (Pick<BookFeeder, 'corporationId' | 'refineryLabels' | 'refineryStructures'> & {
    /** The Feeder's last good read (ms): its pops' Data Age. */
    lastReadWellAt?: number;
  })[];
  /**
   * Pop Sharing marks by refinery (#6226), the book's own moons and its Feeders' alike;
   * absent when the sharing settings could not be read.
   */
  shareMarks?: PopShareMarks['structures'];
}

/**
 * The Feeder Extractions a book holds and the records that name their refineries (#6116),
 * under the officer rules. Null when the corporation has no book. The Extractions come from the
 * Overview read model (ADR 0032: one doc, already windowed and without cancelled ones); a book
 * whose read model is not built yet reads its live chunks instead. Only Feeder rows are kept:
 * the book's own chunks come from ESI.
 */
export async function readFeederChunkParts(
  characterId: number,
  corporationId: number
): Promise<FeederChunkParts | null> {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const book = doc(db, 'corps', String(corporationId));
  if (!(await getDoc(book)).exists()) return null;
  return asOfficer(characterId, corporationId, async () => {
    const [overview, feeders, sharing] = await Promise.all([
      getDoc(doc(book, 'readModels', 'overview')),
      getDocs(collection(book, 'feeders')),
      // Best effort: the pops still list without their marks.
      readPopSharingCached(characterId, corporationId).catch(() => null),
    ]);
    const windowed = overview.data()?.extractions as SyncExtraction[] | undefined;
    const extractions =
      windowed ??
      (
        await getDocs(
          query(
            collection(book, 'extractions'),
            where('naturalDecayTime', '>', new Date().toISOString())
          )
        )
      ).docs.map((d) => d.data() as SyncExtraction);
    const records = feeders.docs.map((d) => ({
      ...(d.data() as FeederDoc),
      corporationId: Number(d.id),
    }));
    const shareMarks = sharing
      ? popShareMarks(
          extractions.map((x) => ({
            moonId: x.moonId,
            structureId: x.structureId,
            startedAt: x.extractionStartTime,
            ...(x.sourceCorporationId === undefined
              ? {}
              : { sourceCorporationId: x.sourceCorporationId }),
          })),
          records,
          sharing
        ).structures
      : undefined;
    return {
      extractions: extractions.filter((x) => x.sourceCorporationId !== undefined),
      ...(shareMarks ? { shareMarks } : {}),
      feeders: records.map(
        ({ corporationId, refineryLabels, refineryStructures, lastReadWellAt }) => {
          return {
            corporationId,
            ...(typeof lastReadWellAt === 'number' ? { lastReadWellAt } : {}),
            ...(refineryLabels ? { refineryLabels } : {}),
            ...(refineryStructures ? { refineryStructures } : {}),
          };
        }
      ),
    };
  });
}

/** Checks the Character's corporation and roles with ESI and records officer access for 24 hours (D7). */
export async function verifyOfficer(
  characterId: number,
  corporationId: number
): Promise<OfficerVerdict> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'verifyCorpOfficerCallable', { corporationId, accessToken });
}

export function uploadSync(characterId: number, upload: SyncUpload): Promise<SyncReceipt> {
  return callSignedIn(characterId, 'syncCorpTaxBookCallable', upload);
}

/**
 * Edits that re-check the Character's roles live (D7). The callable refuses
 * them on the 10-minute cache, so the access token travels with them.
 */
export const LIVE_CHECK_ACTIONS: ReadonlySet<string> = new Set([
  'dismiss',
  'dismissRecords',
  'dismissDispute',
  'reverseDismissal',
  'reverseAdjustment',
  'editAdjustment',
  'reverseWriteOff',
  'setToleranceExemption',
  'writeOff',
  'rebill',
  'markNotTax',
]);

/** A close-account that forfeits credit writes value off, so it re-checks the role live too (#4184). */
function needsLiveToken(action: { action: string } & Record<string, unknown>): boolean {
  return (
    LIVE_CHECK_ACTIONS.has(action.action) ||
    (action.action === 'closeAccount' && (action.credit as { kind?: string })?.kind === 'forfeit')
  );
}

/**
 * One edit action through `editCorpTaxBookCallable`, e.g.
 * `{ action: 'settleStatements', statementIds }`. Attaches the access token
 * for the live-check actions and for nothing else.
 */
export async function editBook<Out = Record<string, unknown>>(
  characterId: number,
  corporationId: number,
  action: { action: string } & Record<string, unknown>,
  options: { freshToken?: boolean } = {}
): Promise<Out> {
  // `freshToken` is for a caller that may outlive the 10-minute role cache (the mail queue).
  const accessToken =
    options.freshToken || needsLiveToken(action)
      ? await getValidAccessToken(characterId)
      : undefined;
  return callSignedIn(characterId, 'editCorpTaxBookCallable', {
    ...action,
    corporationId,
    ...(accessToken !== undefined ? { accessToken } : {}),
  });
}

/** The book's settings, or null when the corporation has none. Any signed-in Character may read this document. */
export async function readBookSummary(
  characterId: number,
  corporationId: number
): Promise<BookSummary | null> {
  await ensureSignedIn(characterId);
  const snap = await getDoc(doc(getSyncFirestore(characterId), 'corps', String(corporationId)));
  return snap.exists() ? summaryFrom(snap.data()) : null;
}

function summaryFrom(d: Record<string, unknown>): BookSummary {
  const { active, startDate, divisions, divisionNames, lastSync, structureExpiryHours } =
    parseBookSettings(d);
  return { active, startDate, divisions, divisionNames, lastSync, structureExpiryHours };
}

/** Characters an officer unlinked: automatic grouping leaves them alone (D26). Officer-only. */
export async function readDeclinedAutoGroup(
  characterId: number,
  corporationId: number
): Promise<Set<number>> {
  await ensureSignedIn(characterId);
  const snap = await getDoc(
    doc(getSyncFirestore(characterId), 'corps', String(corporationId), 'meta', 'declinedAutoGroup')
  );
  const ids = snap.data()?.ids;
  return new Set(Array.isArray(ids) ? (ids as number[]) : []);
}

/** The book's settings and the collections the sync needs. Officer-only: verify first. */
export async function readBookState(
  characterId: number,
  corporationId: number
): Promise<BookState | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const { list } = book;
  const [
    miners,
    statements,
    payments,
    dismissals,
    extractions,
    paidStatementIds,
    writeOffs,
    disputes,
  ] = await Promise.all([
    list<Miner>('miners'),
    list<Statement>('statements'),
    list<SettlePayment>('payments'),
    list<Dismissal>('dismissals'),
    list<SyncExtraction>('extractions'),
    book.paidStatementIds(),
    list<RecordedWriteOff>('writeOffs'),
    list<unknown>('disputes'),
  ]);
  return {
    book: summaryFrom(book.data),
    miners,
    statements,
    payments,
    dismissals,
    extractions,
    paidStatementIds,
    writeOffs,
    disputes: readDisputes(disputes),
  };
}

// --- The whole book, for /corp/moons (issue #4063) --------------------------

/** Every setting the Settings dialog edits, as the book document stores it. */
export type { BookSettings };

/** The book's settings document, or null when the corporation has none. */
export async function readBookSettings(
  characterId: number,
  corporationId: number
): Promise<BookSettings | null> {
  await ensureSignedIn(characterId);
  const snap = await getDoc(doc(getSyncFirestore(characterId), 'corps', String(corporationId)));
  return snap.exists() ? settingsFrom(snap.data()) : null;
}

/** The settings document as `BookSettings`, validated, every default filled in. */
export const settingsFrom = (d: Record<string, unknown>): BookSettings => parseBookSettings(d);

/** A guest's answer to a hand-made grouping (D26b), for the officers to see after the fact. */
export interface GroupingAnswer {
  characterId: number;
  minerId: string;
  answer: 'confirmed' | 'declined';
  /** ISO instant. */
  at: string;
  /** Whether the character answered itself or the Miner's verify link declined for it. */
  via: 'character' | 'verify-link';
}

/** Reads `meta/groupingAnswers`, dropping anything malformed. */
export function groupingAnswersFrom(d: Record<string, unknown> | undefined): GroupingAnswer[] {
  const raw = d?.answers;
  if (typeof raw !== 'object' || raw === null) return [];
  return Object.entries(raw as Record<string, Record<string, unknown>>).flatMap(([id, a]) => {
    const characterId = Number(id);
    if (!Number.isSafeInteger(characterId) || typeof a !== 'object' || a === null) return [];
    if (a.answer !== 'confirmed' && a.answer !== 'declined') return [];
    return [
      {
        characterId,
        minerId: String(a.minerId ?? ''),
        answer: a.answer,
        at: String(a.at ?? ''),
        via: a.via === 'verify-link' ? ('verify-link' as const) : ('character' as const),
      },
    ];
  });
}

/** A payout row with its document id. */
export type FeederPayoutRow = FeederPayout & { id: string };

/**
 * One feeder's record as the officers read it (`corps/{book}/feeders/{corp}`), with its
 * `payouts`. `lastReadWellAt` is an ISO string, as `FeederReadClock` carries it.
 */
export interface BookFeeder extends FeederReadClock {
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: FeederMode;
  sameOwner?: boolean;
  note?: string;
  invitedBy: number;
  joinedAt: number;
  leftAt?: number;
  grantHolder?: number;
  grantedBy?: number;
  lastSyncResult?: { at: number; outcome: 'synced' | 'skipped' | 'stale'; reason?: string };
  /** When ESI first refused the ledger in the current spell (ms). */
  staleSince?: number;
  /** When it disconnected after 30 days stale (ms). */
  disconnectedAt?: number;
  payeeChangedAt?: number;
  /** A pending removal (#4520): who started it and when; `effectiveAt` once its notice is out. */
  removal?: { startedAt: number; startedBy: number; startedByName: string; effectiveAt?: number };
  viewDismissedAt?: number;
  requestedRatePct?: number;
  agreedRatePct?: number;
  offeredOwnerRatePct?: number;
  payee?: { kind: 'corporation' | 'character'; id: number };
  /** Which side set the payee last, who and when (#4653); absent on an older record. */
  payeeSetBy?: PayeeSetBy & { characterId: number };
  coveragePeriods: { from: string; to?: string }[];
  /** Absent on records written before the history existed. */
  ownerRateHistory?: OwnerRateEntry[];
  /** Absent means derive from `mode`. */
  modeChanges?: FeederModeChange[];
  /** Refinery labels by structure id, set by either side's officers (#4640). */
  refineryLabels?: Record<string, StoredRefineryLabel>;
  /** Refineries an officer archived, by structure id (#6298); absent when none were. */
  refineryArchive?: Record<string, RefineryArchive>;
  /** Refinery systems by structure id, learned from miners' own ledgers (#4650). */
  refinerySystems?: Record<string, number>;
  /** Refinery names and systems the sync read with the moon owner's grant (#4654). */
  refineryStructures?: Record<string, StoredRefineryStructure>;
  /** The moon owner's grant reads refinery names (#4654); absent on a grant from before. */
  readsStructureNames?: boolean;
  /** The moon owner turned Pop Sharing off for its moons (#6222); absent is sharing allowed. */
  popSharingOptOut?: { by: number; at: number };
  payouts: FeederPayoutRow[];
}

/** A feeder record as stored: the clock is epoch ms, and the payouts live under it. */
export type FeederDoc = Omit<BookFeeder, 'lastReadWellAt' | 'payouts'> & {
  lastReadWellAt?: number;
};

/** A stored feeder record and its payouts as a `BookFeeder`. */
export function bookFeederFrom(record: FeederDoc, payouts: FeederPayoutRow[]): BookFeeder {
  const { lastReadWellAt, ...rest } = record;
  return {
    ...rest,
    ...(typeof lastReadWellAt === 'number'
      ? { lastReadWellAt: new Date(lastReadWellAt).toISOString() }
      : {}),
    payouts,
  };
}

/**
 * A part of the book a read covers (`bookRead/parts.ts` says which page reads which, and
 * `bookRead/slices.ts` which fields each part fills).
 */
export type BookPart = 'core' | 'observed' | 'ledger' | 'answers' | 'owners';

/** Everything `/corp/moons` renders from. Officer-only: verify first. */
export interface BookData {
  settings: BookSettings;
  state: BookState;
  observed: ObservedRow[];
  declarations: BookDeclaration[];
  adjustments: Adjustment[];
  /** Officers' per-day limits on what a shortfall may forgive (the newest per day decides). */
  toleranceExemptions?: ToleranceExemption[];
  /** Each feeder's last good ledger read (#4509); a feeder's days are Billable only after one. */
  feeders?: BookFeeder[];
  groupingAnswers?: GroupingAnswer[];
  /** The scheduled sync's public status (ADR 0025); null when it was never turned on or was revoked. */
  scheduledSync?: ScheduledSyncStatus | null;
  /** #6207: donations a sync noted in divisions the book does not read (`meta/uncounted`). */
  uncounted?: UncountedDonation[];
  /** #6206: Miners' Conflict disputes (`disputes`), answered or not. Read with the ledger. */
  disputes?: OreDispute[];
  /** Which parts this read covered (`bookRead/`); every field of the others is empty. */
  parts: ReadonlySet<BookPart>;
  /** The Overview and Miners tab docs (ADR 0032); absent until the server has built them. */
  readModels?: ReadModelDocs;
  /**
   * Each moon owner's view summary by corporation id (ADR 0032, #5717); read with the `owners`
   * part. Absent when that part was not read; a moon owner without one is priced from `observed`.
   */
  feederSummaries?: ReadonlyMap<number, FeederViewSummary>;
  /**
   * The Miner a one-Miner read (`readBook` with a `minerId`) covered; absent for the whole book. Then
   * `state.miners` holds that Miner only, so a dialog listing other Miners reads them itself.
   */
  scopedMiner?: string;
}

/**
 * What the group dialog lists on a one-Miner page (#5704): the stored groups and the ledger
 * rows, through the same copies the whole-book read uses, so a warm device reads only the
 * book doc and what changed. Officer-only.
 */
export async function readGroupingSources(
  characterId: number,
  corporationId: number
): Promise<{ miners: Miner[]; observed: ObservedRow[] } | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const [miners, observed] = await Promise.all([book.list<Miner>('miners'), book.observed()]);
  return { miners, observed };
}

/**
 * The book's stored observer rows and its moon owners' coverage, for matching donations against
 * the moon owners' mining the book bills (`syncCorpTaxBook`). Through the same copies the
 * whole-book read uses. Officer-only.
 */
export async function readStoredRows(
  characterId: number,
  corporationId: number
): Promise<{ rows: ObservedRow[]; feeders: FeederCoverage[] }> {
  const book = await openBook(characterId, corporationId);
  if (!book) return { rows: [], feeders: [] };
  const [rows, feeders] = await Promise.all([
    book.observed(),
    book.written('feeders') ? book.read<FeederDoc>('feeders') : Promise.resolve([]),
  ]);
  return {
    rows,
    feeders: feeders.map(({ corporationId: id, coveragePeriods }) => ({
      corporationId: id,
      ...(coveragePeriods ? { coveragePeriods } : {}),
    })),
  };
}

/** A declaration as stored: who recorded it, and who resolved it. */
export type BookDeclaration = Declaration & {
  recordedBy?: number;
  resolution?: NonNullable<Declaration['resolution']> & { by?: number };
};

/** An officer's "rebill from date" (D22), server-written. */
export interface Rebill {
  id: string;
  minerId: string;
  /** First UTC day rebilled. */
  fromDate: string;
  reason: string;
  by: number | null;
  /** ISO instant. */
  at: string;
  /** It touched a corp member's days, which needs a Director. */
  memberRebill: boolean;
}

/** Every rebill in the book, for the export. Officer-only. */
export async function readRebills(characterId: number, corporationId: number): Promise<Rebill[]> {
  const book = await openBook(characterId, corporationId);
  if (!book) return [];
  const { db } = book;
  return book.part('rebills', async () =>
    (await getDocs(collection(db, 'corps', String(corporationId), 'rebills'))).docs.map((d) => ({
      ...(d.data() as Omit<Rebill, 'id'>),
      id: d.id,
    }))
  );
}

/** One audit-log entry (D7): who did what, when. */
export interface AuditEntry {
  id: string;
  at: number;
  by: number | null;
  byName: string;
  via?: string;
  action: string;
  detail: Record<string, unknown>;
}

/** The newest entries of the immutable audit log, newest first. Always limited: the log only grows. */
export async function readAudit(
  characterId: number,
  corporationId: number,
  count = 100
): Promise<AuditEntry[]> {
  await ensureSignedIn(characterId);
  const log = collection(getSyncFirestore(characterId), 'corps', String(corporationId), 'audit');
  const snap = await getDocs(query(log, orderBy('at', 'desc'), limitTo(count)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) }));
}

/** Turns the book on (a Director's act, D10): the start date and the corp default rate. */
export async function turnOnBook(
  characterId: number,
  corporationId: number,
  startDate: string,
  startRatePct: number
): Promise<void> {
  const accessToken = await getValidAccessToken(characterId);
  try {
    await callSignedIn(characterId, 'turnOnCorpTaxBookCallable', {
      corporationId,
      accessToken,
      startDate,
      startRatePct,
    });
  } finally {
    // Also on a throw: the server may have written the book before the call failed.
    await clearNotFound(`corps/${corporationId}`);
  }
}

/**
 * The CEO reclaims the book (ADR 0023): becomes its owner, re-activates it, and
 * every other officer loses access until they re-verify. The role is checked
 * live, so the short-lived access token travels; the refresh token never does.
 */
export async function reclaimBook(
  characterId: number,
  corporationId: number
): Promise<{ officersRevoked: number }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'reclaimCorpTaxBookCallable', { corporationId, accessToken });
}

/**
 * Deletes the corporation's book for good: whoever turned it on (still a
 * Director), or the CEO. Turning it on again starts from nothing.
 */
export async function deleteBook(characterId: number, corporationId: number): Promise<void> {
  const accessToken = await getValidAccessToken(characterId);
  await callSignedIn(characterId, 'deleteCorpTaxBookCallable', { corporationId, accessToken });
}

/** The verify token for each Statement id; one with no link doc is left out. Editors only (rules). */
export async function readVerifyTokens(
  characterId: number,
  corporationId: number,
  statementIds: readonly string[]
): Promise<Map<string, string>> {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const tokens = new Map<string, string>();
  await Promise.all(
    statementIds.map(async (id) => {
      const snap = await getDoc(doc(db, 'corps', String(corporationId), 'statementLinks', id));
      const token = snap.get('verifyToken');
      if (typeof token === 'string' && token !== '') tokens.set(id, token);
    })
  );
  return tokens;
}

/** Where a Statement's verify link points: the public page routes/CorpTaxBookVerify.tsx serves it. */
export function verifyUrl(origin: string, token: string): string {
  return `${origin}/corp-tax-book/verify/${token}`;
}
