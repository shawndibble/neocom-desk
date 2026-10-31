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
import type { CallableAction } from '../../../../functions/src/callableManifest';
import { DEFAULT_GRACE_HOURS } from '@/engine/corpTaxBook/billable';
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
import type { RecordedWriteOff } from '@/engine/corpTaxBook/allocation';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { Declaration } from '@/engine/corpTaxBook/overdue';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment, Statement, StatementCadence } from '@/engine/corpTaxBook/statements';
import {
  extractionId as extractionIdOf,
  type JournalDonation,
  type LastSync,
  type SettlePayment,
  type SyncExtraction,
  type SyncGap,
} from '@/engine/corpTaxBook/sync';
import { scheduledSyncFrom, type ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import type {
  FeederMode,
  FeederModeChange,
  FeederPayout,
} from '@/engine/corpTaxBook/feederAccrual';
import type { FeederReadClock } from '@/engine/corpTaxBook/feederHealth';
import type { RemovalNoticeRecord } from '@/engine/corpTaxBook/mailQueue';
import type { OwnerRateEntry } from '@/engine/corpTaxBook/ownerRate';
import type { StoredRefineryLabel, StoredRefineryStructure } from '@/engine/corpTaxBook/refinery';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore } from '@/sync/firebaseApp';
import { bookVersionsOf, cachedPart } from './bookCache';
import { bookPartStore } from './bookPartStore';
import { ALL_BOOK_PART_SET, mergeBookParts, type BookPart, type BookPartSet } from './bookParts';
import type { FeederViewSummary } from './feederViewClient';
import { readObservedRows } from './observedRead';
import {
  minerScopedRows,
  openWindowStart,
  type HeaderTotals,
} from '@/engine/corpTaxBook/minerScope';
import { forgetObservedCopy } from './observedStore';
import type { ReadModelDocs } from '@/engine/corpTaxBook/readModels';
import { moonDocUsable, planMoonScope } from '@/engine/corpTaxBook/pullFigures';
import type { MoonDoc } from '../../../../functions/src/corpTaxBookMoonDocs';
import { callRouted } from '@/sync/routedCallable';
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
  /** Officer write-offs (#4637): they reduce what a Miner owes. */
  writeOffs?: RecordedWriteOff[];
}

export interface SyncUpload {
  corporationId: number;
  observed?: ObservedRow[];
  extractions?: SyncExtraction[];
  donations?: JournalDonation[];
  gaps?: SyncGap[];
}

export interface SyncReceipt {
  observedChanged: number;
  extractions: number;
  donationsAdded: number;
}

/** One Corp Tax Book callable, signed in as `characterId`; the other taxBook clients share it. */
export async function call<In, Out>(
  characterId: number,
  name: CallableAction,
  data: In
): Promise<Out> {
  await ensureSignedIn(characterId);
  const result = await callRouted<In, Out>(name, data, characterId);
  return result;
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
  const read = async () => (await getDoc(ref)).data() as RemovalNoticeRecord | undefined;
  try {
    return await read();
  } catch (error) {
    if (!String((error as { code?: unknown }).code ?? '').endsWith('permission-denied'))
      throw error;
    await verifyOfficer(characterId, corporationId);
    return read();
  }
}

/** Checks the Character's corporation and roles with ESI and records officer access for 24 hours (D7). */
export async function verifyOfficer(
  characterId: number,
  corporationId: number
): Promise<OfficerVerdict> {
  const accessToken = await getValidAccessToken(characterId);
  return call(characterId, 'verifyCorpOfficerCallable', { corporationId, accessToken });
}

export function uploadSync(characterId: number, upload: SyncUpload): Promise<SyncReceipt> {
  return call(characterId, 'syncCorpTaxBookCallable', upload);
}

/**
 * Edits that re-check the Character's roles live (D7). The callable refuses
 * them on the 10-minute cache, so the access token travels with them.
 */
export const LIVE_CHECK_ACTIONS: ReadonlySet<string> = new Set([
  'dismiss',
  'dismissRecords',
  'reverseDismissal',
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
  return call(characterId, 'editCorpTaxBookCallable', {
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
  return {
    active: d.active === true,
    startDate: String(d.startDate ?? ''),
    divisions: Array.isArray(d.divisions) ? (d.divisions as number[]) : [1],
    lastSync: (d.lastSync as LastSync | null | undefined) ?? null,
    structureExpiryHours: (d.structureExpiryHours as Record<string, number> | undefined) ?? {},
  };
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

/**
 * Opens a book for reading: its settings document (always read: it carries
 * the version marker), and readers for its parts that reuse this tab's copy
 * while the part's stamp is unchanged (bookCache.ts, issue #5047).
 */
async function openBook(characterId: number, corporationId: number) {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const snap = await getDoc(doc(db, 'corps', String(corporationId)));
  if (!snap.exists()) {
    // A deleted book takes its rows with it; a re-created one must not inherit ghosts.
    await forgetObservedCopy(characterId, corporationId).catch(() => {});
    return null;
  }
  const data = snap.data();
  const versions = bookVersionsOf(data);
  const key = `${characterId}:${corporationId}`;
  // `meta/paid` is read fresh every time, never from the copy: it is
  // officer-only, so the rules still decide each open. Every part waits on it,
  // so no copy is handed out to a Character the rules now refuse.
  const paid = getDoc(doc(db, 'corps', String(corporationId), 'meta', 'paid'));
  // A refusal here means the rules no longer let this Character in: nothing of the book stays on the device.
  paid.catch(async (error) => {
    if (String((error as { code?: unknown } | null)?.code ?? '').endsWith('permission-denied'))
      await forgetObservedCopy(characterId, corporationId).catch(() => {});
  });
  const store = bookPartStore(characterId, corporationId);
  const paidStatementIds = async () =>
    new Set(((await paid).data()?.ids as string[] | undefined) ?? []);
  const part = async <T>(
    collectionName: string,
    readPart: () => Promise<T>,
    slot?: string,
    persist = true
  ) => {
    const [, value] = await Promise.all([
      paid,
      cachedPart(key, collectionName, versions, readPart, {
        ...(slot ? { slot } : {}),
        ...(persist ? { store } : {}),
      }),
    ]);
    return value;
  };
  const read = async <T>(name: string): Promise<T[]> =>
    (await getDocs(collection(db, 'corps', String(corporationId), name))).docs.map(
      (d) => d.data() as T
    );
  const list = <T>(name: string): Promise<T[]> => part(name, () => read<T>(name));
  // `observed` is the book's biggest part: a delta over this device's Dexie copy (observedRead.ts).
  const observed = (): Promise<ObservedRow[]> =>
    part(
      'observed',
      () =>
        readObservedRows(
          db,
          characterId,
          corporationId,
          versions?.collections.observed,
          paid,
          Date.now(),
          typeof data.createdAt === 'number' ? data.createdAt : undefined
        ),
      undefined,
      false // its own Dexie copy (ADR 0031)
    );
  return { db, data, part, read, list, observed, paidStatementIds };
}

/** The book's settings and the collections the sync needs. Officer-only: verify first. */
export async function readBookState(
  characterId: number,
  corporationId: number
): Promise<BookState | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const { list } = book;
  const [miners, statements, payments, dismissals, extractions, paidStatementIds, writeOffs] =
    await Promise.all([
      list<Miner>('miners'),
      list<Statement>('statements'),
      list<SettlePayment>('payments'),
      list<Dismissal>('dismissals'),
      list<SyncExtraction>('extractions'),
      book.paidStatementIds(),
      list<RecordedWriteOff>('writeOffs'),
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
  };
}

// --- The whole book, for /corp/moons (issue #4063) --------------------------

/** Every setting the Settings dialog edits, as the book document stores it. */
export interface BookSettings extends BookSummary {
  hubId: string;
  oreForm: 'compressed' | 'raw';
  graceHours: number;
  minimumStatement: number;
  overdueDays: number;
  cadence: StatementCadence;
  chunkM3PerHour: number | null;
  rates: TaxRate[];
  /** Above this a dismissal needs a Director (D6); null when there is no limit. */
  dismissApprovalAboveIsk: number | null;
  ownerCharacterId: number | null;
  /** Who turned the book on; the owner changes when the CEO reclaims it. */
  createdBy: number | null;
  /** Epoch ms: until then members' own Mining Tax pages ignore the book (setup window). */
  membersSeeFrom?: number;
}

/** The book's settings document, or null when the corporation has none. */
export async function readBookSettings(
  characterId: number,
  corporationId: number
): Promise<BookSettings | null> {
  await ensureSignedIn(characterId);
  const snap = await getDoc(doc(getSyncFirestore(characterId), 'corps', String(corporationId)));
  return snap.exists() ? settingsFrom(snap.data()) : null;
}

function settingsFrom(d: Record<string, unknown>): BookSettings {
  const num = (v: unknown, fallback: number) => (typeof v === 'number' ? v : fallback);
  return {
    active: d.active === true,
    startDate: String(d.startDate ?? ''),
    divisions: Array.isArray(d.divisions) ? (d.divisions as number[]) : [1],
    lastSync: (d.lastSync as LastSync | null | undefined) ?? null,
    structureExpiryHours: (d.structureExpiryHours as Record<string, number> | undefined) ?? {},
    hubId: typeof d.hubId === 'string' ? d.hubId : 'jita',
    oreForm: d.oreForm === 'raw' ? 'raw' : 'compressed',
    graceHours: num(d.graceHours, DEFAULT_GRACE_HOURS),
    minimumStatement: num(d.minimumStatement, 5_000_000),
    overdueDays: num(d.overdueDays, 14),
    cadence: (d.cadence as StatementCadence | undefined) ?? { kind: 'monthly' },
    chunkM3PerHour: typeof d.chunkM3PerHour === 'number' ? d.chunkM3PerHour : null,
    rates: Array.isArray(d.rates) ? (d.rates as TaxRate[]) : [],
    dismissApprovalAboveIsk:
      typeof d.dismissApprovalAboveIsk === 'number' ? d.dismissApprovalAboveIsk : null,
    ownerCharacterId: typeof d.ownerCharacterId === 'number' ? d.ownerCharacterId : null,
    createdBy: typeof d.createdBy === 'number' ? d.createdBy : null,
    ...(typeof d.membersSeeFrom === 'number' ? { membersSeeFrom: d.membersSeeFrom } : {}),
  };
}

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
  /** Refinery systems by structure id, learned from miners' own ledgers (#4650). */
  refinerySystems?: Record<string, number>;
  /** Refinery names and systems the sync read with the moon owner's grant (#4654). */
  refineryStructures?: Record<string, StoredRefineryStructure>;
  /** The moon owner's grant reads refinery names (#4654); absent on a grant from before. */
  readsStructureNames?: boolean;
  payouts: FeederPayoutRow[];
}

type FeederDoc = Omit<BookFeeder, 'lastReadWellAt' | 'payouts'> & { lastReadWellAt?: number };

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

/** Everything `/corp/moons` renders from. Officer-only: verify first. */
export interface BookData {
  settings: BookSettings;
  state: BookState;
  observed: ObservedRow[];
  declarations: BookDeclaration[];
  adjustments: Adjustment[];
  /** Each feeder's last good ledger read (#4509); a feeder's days are Billable only after one. */
  feeders?: BookFeeder[];
  groupingAnswers?: GroupingAnswer[];
  /** The scheduled sync's public status (ADR 0025); null when it was never turned on or was revoked. */
  scheduledSync?: ScheduledSyncStatus | null;
  /** Which slices this read covered (bookParts.ts); the rest are empty. Absent: the whole book. */
  parts?: BookPartSet;
  /** The Overview and Miners tab docs (ADR 0032); absent until the server has built them. */
  readModels?: ReadModelDocs;
  /**
   * Each moon owner's view summary by corporation id (ADR 0032, #5717); read with the `owners`
   * part. Absent when that part was not read; a moon owner without one is priced from `observed`.
   */
  feederSummaries?: ReadonlyMap<number, FeederViewSummary>;
  /**
   * The Miner a one-Miner read (`readMinerBookData`) covered; absent for the whole book. Then
   * `state.miners` holds that Miner only, so a dialog listing other Miners reads them itself.
   */
  scopedMiner?: string;
}

const feederPayouts = (characterId: number, book: number, feeder: number) =>
  collection(
    getSyncFirestore(characterId),
    'corps',
    String(book),
    'feeders',
    String(feeder),
    'payouts'
  );

type OpenBook = NonNullable<Awaited<ReturnType<typeof openBook>>>;

/** Every feeder with its payouts. One stamp covers a feeder's record and its payouts: both live under `feeders`. */
function feedersOf(
  book: Pick<OpenBook, 'part' | 'read'>,
  characterId: number,
  corporationId: number
): Promise<BookFeeder[]> {
  return book.part(
    'feeders',
    async () =>
      Promise.all(
        (await book.read<FeederDoc>('feeders')).map(async (f) =>
          bookFeederFrom(
            f,
            (await getDocs(feederPayouts(characterId, corporationId, f.corporationId))).docs.map(
              (d) => ({ ...d.data(), id: d.id }) as FeederPayoutRow
            )
          )
        )
      ),
    'feeders:rows'
  );
}

/**
 * The book's moon owners' view summaries, one doc each, nothing under them. An officer of the
 * book may read them (rules, #5717). One that is missing, or that the rules do not yet let this
 * officer read, is left out: the caller prices that moon owner from its ledger rows instead.
 */
async function readFeederSummaries(
  characterId: number,
  corporationId: number,
  feederCorporationIds: readonly number[]
): Promise<Map<number, FeederViewSummary>> {
  const db = getSyncFirestore(characterId);
  const found = await Promise.all(
    feederCorporationIds.map(async (id) => {
      try {
        const snap = await getDoc(
          doc(db, 'corps', String(corporationId), 'feederViews', String(id))
        );
        return snap.exists() ? ([id, snap.data() as FeederViewSummary] as const) : undefined;
      } catch {
        return undefined;
      }
    })
  );
  return new Map(found.flatMap((f) => (f ? [f] : [])));
}

/**
 * `parts` limits the read to those slices (bookParts.ts); the others come back
 * empty, and `parts` on the result says which were read. Default: the whole book.
 */
export async function readBookData(
  characterId: number,
  corporationId: number,
  parts: BookPartSet = ALL_BOOK_PART_SET
): Promise<BookData | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const settings = settingsFrom(book.data);
  const { list, part } = book;
  const meta = (id: string) =>
    getDoc(doc(getSyncFirestore(characterId), 'corps', String(corporationId), 'meta', id));
  const slice = <T>(name: BookPart, readSlice: () => Promise<T>, empty: T) =>
    parts.has(name) ? readSlice() : Promise.resolve(empty);
  const none: never[] = [];
  const [
    [miners, statements, extractions, observed, scheduled, feederRows],
    [payments, dismissals, declarations, adjustments, writeOffs],
    answers,
    paidStatementIds,
    readModels,
  ] = await Promise.all([
    slice(
      'core',
      () =>
        Promise.all([
          list<Miner>('miners'),
          list<Statement>('statements'),
          list<SyncExtraction>('extractions'),
          book.observed(),
          part('meta', async () => (await meta('scheduledSync')).data(), 'meta:schedule'),
          feedersOf(book, characterId, corporationId),
        ] as const),
      [none, none, none, none, undefined, none] as const
    ),
    slice(
      'ledger',
      () =>
        Promise.all([
          list<SettlePayment>('payments'),
          list<Dismissal>('dismissals'),
          list<BookDeclaration>('declarations'),
          list<Adjustment>('adjustments'),
          list<RecordedWriteOff>('writeOffs'),
        ] as const),
      [none, none, none, none, none] as const
    ),
    slice(
      'answers',
      () => part('meta', async () => (await meta('groupingAnswers')).data(), 'meta:answers'),
      undefined
    ),
    book.paidStatementIds(),
    // Two docs, one stamp (ADR 0032). Best effort, even on a refusal (rules not deployed): the
    // screens fall back to the whole-book view, and the book's own reads above already surface
    // a lost role.
    part('readModels', async () => {
      const docs = async (id: string) =>
        (
          await getDoc(
            doc(getSyncFirestore(characterId), 'corps', String(corporationId), 'readModels', id)
          )
        ).data();
      const [minerList, overview] = await Promise.all([docs('minerList'), docs('overview')]);
      return { minerList, overview } as ReadModelDocs;
    }).catch(() => undefined),
  ]);
  // One doc per moon owner, from the cached record list when `core` was read earlier.
  const feederSummaries = parts.has('owners')
    ? await readFeederSummaries(
        characterId,
        corporationId,
        (parts.has('core') ? feederRows : await feedersOf(book, characterId, corporationId)).map(
          (f) => f.corporationId
        )
      )
    : undefined;
  return {
    settings,
    state: {
      book: settings,
      miners,
      statements,
      payments,
      dismissals,
      extractions,
      paidStatementIds,
      writeOffs,
    },
    observed,
    declarations,
    adjustments,
    feeders: feederRows,
    groupingAnswers: groupingAnswersFrom(answers),
    scheduledSync: scheduledSyncFrom(scheduled),
    parts,
    ...(readModels ? { readModels } : {}),
    ...(feederSummaries ? { feederSummaries } : {}),
  };
}

// --- One Miner's page from the read models (issue #5258, ADR 0032) ---------------

/** What the Miner page reads, scoped to one Miner. */
export interface MinerBookRead {
  /** A whole-book shape, scoped: this Miner's records and ledger window only. */
  data: BookData;
  /** First day whose ledger rows were read; frozen days before it come from Statement lines. */
  from: string;
  /** The Miner's stored totals; absent when the read model is not deployed or built yet. */
  totals?: HeaderTotals;
}

const IN_LIMIT = 30;
const isMissingIndex = (error: unknown) =>
  String((error as { code?: unknown } | null)?.code ?? '').endsWith('failed-precondition');

/**
 * One Miner's page: the Miner's totals doc, their Statements, payments, write-offs,
 * adjustments and declarations by Miner, the book's dismissals and Extractions, and the
 * ledger rows since the newest Statement began. Never the whole ledger. Officer-only.
 * A missing composite index (observed: characterId + date) falls back to the Miner's
 * characters' whole ledger, filtered here, so an undeployed index costs reads, not the page.
 */
export async function readMinerBookData(
  characterId: number,
  corporationId: number,
  minerId: string
): Promise<MinerBookRead | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const settings = settingsFrom(book.data);
  const { db, list, part } = book;
  const under = (name: string) => collection(db, 'corps', String(corporationId), name);
  const byMiner = async <T>(name: string): Promise<T[]> =>
    (await getDocs(query(under(name), where('minerId', '==', minerId)))).docs.map(
      (d) => d.data() as T
    );
  const meta = (id: string) => getDoc(doc(db, 'corps', String(corporationId), 'meta', id));
  const one = async (name: string) => {
    const snap = await getDoc(doc(db, 'corps', String(corporationId), name, minerId));
    return snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
  };
  // The totals doc may not be deployed or readable yet: no reason to lose the page.
  // A refusal is not that, and neither is a failed grouping read (the Miner would vanish).
  const totalsOrNone = async () => {
    try {
      return await one('minerTotals');
    } catch (error) {
      if (String((error as { code?: unknown } | null)?.code ?? '').endsWith('permission-denied'))
        throw error;
      return undefined;
    }
  };
  const [grouping, totalsDoc, statements, payments, writeOffs, adjustments] = await Promise.all([
    one('miners'),
    totalsOrNone(),
    byMiner<Statement>('statements'),
    byMiner<SettlePayment>('payments'),
    byMiner<RecordedWriteOff>('writeOffs'),
    byMiner<Adjustment>('adjustments'),
  ]);
  const solo = /^solo:(\d+)$/.exec(minerId);
  const characterIds = Array.isArray(grouping?.characterIds)
    ? (grouping.characterIds as number[])
    : solo
      ? [Number(solo[1])]
      : [];
  const from = openWindowStart(statements, settings.startDate);

  const windowRows = async (): Promise<ObservedRow[]> => {
    const rows: ObservedRow[] = [];
    for (let i = 0; i < characterIds.length; i += IN_LIMIT) {
      const ids = characterIds.slice(i, i + IN_LIMIT);
      try {
        const snap = await getDocs(
          query(under('observed'), where('characterId', 'in', ids), where('date', '>=', from))
        );
        rows.push(...snap.docs.map((d) => d.data() as ObservedRow));
      } catch (error) {
        if (!isMissingIndex(error)) throw error;
        const snap = await getDocs(query(under('observed'), where('characterId', 'in', ids)));
        rows.push(...snap.docs.map((d) => d.data() as ObservedRow).filter((r) => r.date >= from));
      }
    }
    return rows;
  };
  /** The corporation a character's newest ledger row was recorded under: member, leaver or guest. */
  const latestCorp = async (id: number, known: readonly ObservedRow[]) => {
    const mine = known.filter((r) => r.characterId === id);
    if (mine.length > 0)
      return mine.reduce((a, b) => (b.date >= a.date ? b : a)).recordedCorporationId;
    try {
      const snap = await getDocs(
        query(
          under('observed'),
          where('characterId', '==', id),
          orderBy('date', 'desc'),
          limitTo(1)
        )
      );
      const newest = snap.docs[0]?.data() as ObservedRow | undefined;
      return newest?.recordedCorporationId ?? corporationId;
    } catch {
      return corporationId;
    }
  };
  const declarationsOf = async (): Promise<BookDeclaration[]> => {
    const ids = statements.map((s) => s.id);
    const out: BookDeclaration[] = [];
    for (let i = 0; i < ids.length; i += IN_LIMIT)
      out.push(
        ...(
          await getDocs(
            query(under('declarations'), where('statementId', 'in', ids.slice(i, i + IN_LIMIT)))
          )
        ).docs.map((d) => d.data() as BookDeclaration)
      );
    return out;
  };

  const [windowed, dismissals, extractions, feeders, declarations, answers, scheduled, paid] =
    await Promise.all([
      windowRows(),
      list<Dismissal>('dismissals'),
      list<SyncExtraction>('extractions'),
      feedersOf(book, characterId, corporationId),
      statements.length > 0 ? declarationsOf() : Promise.resolve([] as BookDeclaration[]),
      part('meta', async () => (await meta('groupingAnswers')).data(), 'meta:answers'),
      part('meta', async () => (await meta('scheduledSync')).data(), 'meta:schedule'),
      book.paidStatementIds(),
    ]);
  const corps = new Map(
    await Promise.all(characterIds.map(async (id) => [id, await latestCorp(id, windowed)] as const))
  );
  const observed = minerScopedRows(statements, windowed, {
    corpFor: (id) => corps.get(id) ?? corporationId,
  });
  const miner = grouping ? [grouping as unknown as Miner] : [];
  return {
    from,
    ...(totalsDoc ? { totals: totalsDoc as unknown as HeaderTotals } : {}),
    data: {
      settings,
      state: {
        book: settings,
        miners: miner,
        statements,
        payments,
        dismissals,
        extractions,
        paidStatementIds: paid,
        writeOffs,
      },
      observed,
      declarations,
      adjustments,
      feeders,
      groupingAnswers: groupingAnswersFrom(answers),
      scheduledSync: scheduledSyncFrom(scheduled),
      parts: ALL_BOOK_PART_SET,
      scopedMiner: minerId,
    },
  };
}

// --- One moon's page from the moon docs (issue #5716, ADR 0032) ----------------

/** What a moon page reads, scoped to one pull and its moon's cycles. */
export interface MoonBookRead {
  /** A whole-book shape without the ledger: the rows are the planned pulls' windows only. */
  data: BookData;
  /** The moon docs of the shown pull's refinery, by extraction id. */
  docs: ReadonlyMap<string, MoonDoc>;
  /** Cycles whose figures come from their docs, not from rows. */
  fromDocs: ReadonlySet<string>;
}

const isPermissionDenied = (error: unknown) =>
  String((error as { code?: unknown } | null)?.code ?? '').endsWith('permission-denied');

/**
 * A moon page: the book's records without the ledger, the refinery's moon docs, and the
 * rows of the shown pull's window (plus any earlier cycle of the moon that can still have an
 * open day; pullFigures.ts). `'fallback'` when a doc the page needs is missing, on another
 * schema or unreadable: the caller then reads the whole book. A missing composite index
 * (observed: structureId + date) reads the window's days at every refinery and filters here,
 * so an undeployed index costs reads, not the page. Officer-only.
 */
export async function readMoonBookData(
  characterId: number,
  corporationId: number,
  extractionId: string
): Promise<MoonBookRead | 'fallback' | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const settings = settingsFrom(book.data);
  const { db, list, part } = book;
  const under = (name: string) => collection(db, 'corps', String(corporationId), name);
  const meta = (id: string) => getDoc(doc(db, 'corps', String(corporationId), 'meta', id));
  const none: never[] = [];
  const [miners, statements, extractions, scheduled, feeders] = await Promise.all([
    list<Miner>('miners'),
    list<Statement>('statements'),
    list<SyncExtraction>('extractions'),
    part('meta', async () => (await meta('scheduledSync')).data(), 'meta:schedule'),
    feedersOf(book, characterId, corporationId),
  ] as const);
  const [payments, dismissals, declarations, adjustments, writeOffs, paidStatementIds] =
    await Promise.all([
      list<SettlePayment>('payments'),
      list<Dismissal>('dismissals'),
      list<BookDeclaration>('declarations'),
      list<Adjustment>('adjustments'),
      list<RecordedWriteOff>('writeOffs'),
      book.paidStatementIds(),
    ] as const);

  const shown = extractions.find((x) => extractionIdOf(x) === extractionId);
  const docList = shown
    ? await part(
        'moonDocs',
        async () =>
          (
            await getDocs(query(under('moonDocs'), where('structureId', '==', shown.structureId)))
          ).docs.map((d) => {
            // The server's timestamp is not part of the figures, and a class instance does not clone into the copy.
            const fields = { ...d.data() };
            delete fields.updatedAt;
            return fields as unknown as MoonDoc;
          }),
        `moonDocs:s:${shown.structureId}`
      ).catch((error) => {
        if (isPermissionDenied(error)) throw error;
        return undefined;
      })
    : [];
  if (!docList) return 'fallback';
  const docs = new Map(docList.filter(moonDocUsable).map((d) => [d.extractionId, d]));
  const scope = planMoonScope({
    extractionId,
    extractions,
    docs,
    statements,
    startDate: settings.startDate,
    expiryHours: settings.structureExpiryHours,
  });
  if (!scope.ok) return 'fallback';

  const windowRows = async (w: { structureId: number; from: string; to: string }) => {
    const days = [where('date', '>=', w.from), where('date', '<=', w.to)] as const;
    try {
      const snap = await getDocs(
        query(under('observed'), where('structureId', '==', w.structureId), ...days)
      );
      return snap.docs.map((d) => d.data() as ObservedRow);
    } catch (error) {
      if (!isMissingIndex(error)) throw error;
      const snap = await getDocs(query(under('observed'), ...days));
      return snap.docs
        .map((d) => d.data() as ObservedRow)
        .filter((r) => r.structureId === w.structureId);
    }
  };
  const observed = (await Promise.all(scope.rows.map(windowRows))).flat();
  return {
    docs,
    fromDocs: scope.fromDocs,
    data: {
      settings,
      state: {
        book: settings,
        miners,
        statements,
        payments,
        dismissals,
        extractions,
        paidStatementIds,
        writeOffs,
      },
      observed,
      declarations,
      adjustments,
      feeders,
      groupingAnswers: none,
      scheduledSync: scheduledSyncFrom(scheduled),
      parts: new Set<BookPart>(['core', 'ledger']),
    },
  };
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

/** `extra`'s slices laid over `held`; everything else, and the settings, is `extra`'s fresher copy. */
export function mergeBookData(held: BookData, extra: BookData): BookData {
  const parts = mergeBookParts(held.parts, extra.parts);
  const fresh = (name: BookPart) => extra.parts?.has(name) ?? true;
  const pick = <T>(name: BookPart, fromHeld: T, fromExtra: T) =>
    fresh(name) ? fromExtra : fromHeld;
  return {
    settings: extra.settings,
    state: {
      ...extra.state,
      miners: pick('core', held.state.miners, extra.state.miners),
      statements: pick('core', held.state.statements, extra.state.statements),
      extractions: pick('core', held.state.extractions, extra.state.extractions),
      payments: pick('ledger', held.state.payments, extra.state.payments),
      dismissals: pick('ledger', held.state.dismissals, extra.state.dismissals),
      writeOffs: pick('ledger', held.state.writeOffs, extra.state.writeOffs),
    },
    observed: pick('core', held.observed, extra.observed),
    feeders: pick('core', held.feeders, extra.feeders),
    scheduledSync: pick('core', held.scheduledSync, extra.scheduledSync),
    declarations: pick('ledger', held.declarations, extra.declarations),
    adjustments: pick('ledger', held.adjustments, extra.adjustments),
    groupingAnswers: pick('answers', held.groupingAnswers, extra.groupingAnswers),
    parts,
    ...((extra.readModels ?? held.readModels)
      ? { readModels: extra.readModels ?? held.readModels }
      : {}),
    ...(pick('owners', held.feederSummaries, extra.feederSummaries)
      ? { feederSummaries: pick('owners', held.feederSummaries, extra.feederSummaries) }
      : {}),
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
    await call(characterId, 'turnOnCorpTaxBookCallable', {
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
  return call(characterId, 'reclaimCorpTaxBookCallable', { corporationId, accessToken });
}

/**
 * Deletes the corporation's book for good: whoever turned it on (still a
 * Director), or the CEO. Turning it on again starts from nothing.
 */
export async function deleteBook(characterId: number, corporationId: number): Promise<void> {
  const accessToken = await getValidAccessToken(characterId);
  await call(characterId, 'deleteCorpTaxBookCallable', { corporationId, accessToken });
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
