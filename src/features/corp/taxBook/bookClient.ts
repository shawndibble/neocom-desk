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
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit as limitTo,
  orderBy,
  query,
} from 'firebase/firestore/lite';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { Declaration } from '@/engine/corpTaxBook/overdue';
import type { TaxRate } from '@/engine/corpTaxBook/rates';
import type { Adjustment, Statement, StatementCadence } from '@/engine/corpTaxBook/statements';
import type {
  JournalDonation,
  LastSync,
  SettlePayment,
  SyncExtraction,
  SyncGap,
} from '@/engine/corpTaxBook/sync';
import { scheduledSyncFrom, type ScheduledSyncStatus } from '@/engine/corpTaxBook/scheduledSync';
import type { FeederModeChange, FeederPayout } from '@/engine/corpTaxBook/feederAccrual';
import type { FeederReadClock } from '@/engine/corpTaxBook/feederHealth';
import type { RemovalNoticeRecord } from '@/engine/corpTaxBook/mailQueue';
import type { OwnerRateEntry } from '@/engine/corpTaxBook/ownerRate';
import type { ObservedRow } from '@/engine/corpTaxBook/types';
import { getSyncFirestore, getSyncFunctions } from '@/sync/firebaseApp';
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

async function call<In, Out>(characterId: number, name: string, data: In): Promise<Out> {
  await ensureSignedIn(characterId);
  const result = await httpsCallable<In, Out>(getSyncFunctions(), name)(data);
  return result.data;
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
    getSyncFirestore(),
    'corpTaxBooks',
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
  const snap = await getDoc(doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId)));
  if (!snap.exists()) return null;
  const d = snap.data();
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
    doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId), 'meta', 'declinedAutoGroup')
  );
  const ids = snap.data()?.ids;
  return new Set(Array.isArray(ids) ? (ids as number[]) : []);
}

/** The book's settings and the collections the sync needs. Officer-only: verify first. */
export async function readBookState(
  characterId: number,
  corporationId: number
): Promise<BookState | null> {
  const book = await readBookSummary(characterId, corporationId);
  if (!book) return null;
  const root = (name: string) =>
    collection(getSyncFirestore(), 'corpTaxBooks', String(corporationId), name);
  const list = async <T>(name: string): Promise<T[]> =>
    (await getDocs(root(name))).docs.map((d) => d.data() as T);
  const [miners, statements, payments, dismissals, extractions, paid] = await Promise.all([
    list<Miner>('miners'),
    list<Statement>('statements'),
    list<SettlePayment>('payments'),
    list<Dismissal>('dismissals'),
    list<SyncExtraction>('extractions'),
    getDoc(doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId), 'meta', 'paid')),
  ]);
  return {
    book,
    miners,
    statements,
    payments,
    dismissals,
    extractions,
    paidStatementIds: new Set((paid.data()?.ids as string[] | undefined) ?? []),
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
  const snap = await getDoc(doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId)));
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
    graceHours: num(d.graceHours, 6),
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
 * One feeder's record as the officers read it (`corpTaxBooks/{book}/feeders/{corp}`), with its
 * `payouts`. `lastReadWellAt` is an ISO string, as `FeederReadClock` carries it.
 */
export interface BookFeeder extends FeederReadClock {
  status: 'active' | 'pending-removal' | 'removed' | 'left' | 'disconnected';
  mode: 'normal' | 'settled-otherwise';
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
  coveragePeriods: { from: string; to?: string }[];
  /** Absent on records written before the history existed. */
  ownerRateHistory?: OwnerRateEntry[];
  /** Absent means derive from `mode`. */
  modeChanges?: FeederModeChange[];
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
  declarations: Declaration[];
  adjustments: Adjustment[];
  /** Each feeder's last good ledger read (#4509); a feeder's days are Billable only after one. */
  feeders?: BookFeeder[];
  groupingAnswers?: GroupingAnswer[];
  /** The scheduled sync's public status (ADR 0025); null when it was never turned on or was revoked. */
  scheduledSync?: ScheduledSyncStatus | null;
}

const feederPayouts = (book: number, feeder: number) =>
  collection(
    getSyncFirestore(),
    'corpTaxBooks',
    String(book),
    'feeders',
    String(feeder),
    'payouts'
  );

export async function readBookData(
  characterId: number,
  corporationId: number
): Promise<BookData | null> {
  const settings = await readBookSettings(characterId, corporationId);
  if (!settings) return null;
  const root = (name: string) =>
    collection(getSyncFirestore(), 'corpTaxBooks', String(corporationId), name);
  const list = async <T>(name: string): Promise<T[]> =>
    (await getDocs(root(name))).docs.map((d) => d.data() as T);
  const [
    miners,
    statements,
    payments,
    dismissals,
    extractions,
    paid,
    observed,
    declarations,
    adjustments,
    answers,
    scheduled,
    feeders,
  ] = await Promise.all([
    list<Miner>('miners'),
    list<Statement>('statements'),
    list<SettlePayment>('payments'),
    list<Dismissal>('dismissals'),
    list<SyncExtraction>('extractions'),
    getDoc(doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId), 'meta', 'paid')),
    list<ObservedRow>('observed'),
    list<Declaration>('declarations'),
    list<Adjustment>('adjustments'),
    getDoc(
      doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId), 'meta', 'groupingAnswers')
    ),
    getDoc(doc(getSyncFirestore(), 'corpTaxBooks', String(corporationId), 'meta', 'scheduledSync')),
    list<FeederDoc>('feeders'),
  ]);
  const feederRows = await Promise.all(
    feeders.map(async (f) =>
      bookFeederFrom(
        f,
        (await getDocs(feederPayouts(corporationId, f.corporationId))).docs.map(
          (d) => ({ ...d.data(), id: d.id }) as FeederPayoutRow
        )
      )
    )
  );
  return {
    settings,
    state: {
      book: settings,
      miners,
      statements,
      payments,
      dismissals,
      extractions,
      paidStatementIds: new Set((paid.data()?.ids as string[] | undefined) ?? []),
    },
    observed,
    declarations,
    adjustments,
    feeders: feederRows,
    groupingAnswers: groupingAnswersFrom(answers.data()),
    scheduledSync: scheduledSyncFrom(scheduled.data()),
  };
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

/** The newest entries of the immutable audit log; its ids sort by time. */
export async function readAudit(
  characterId: number,
  corporationId: number,
  count = 100
): Promise<AuditEntry[]> {
  await ensureSignedIn(characterId);
  const snap = await getDocs(
    query(
      collection(getSyncFirestore(), 'corpTaxBooks', String(corporationId), 'audit'),
      orderBy('at', 'desc'),
      limitTo(count)
    )
  );
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
  await call(characterId, 'turnOnCorpTaxBookCallable', {
    corporationId,
    accessToken,
    startDate,
    startRatePct,
  });
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
  const db = getSyncFirestore();
  const tokens = new Map<string, string>();
  await Promise.all(
    statementIds.map(async (id) => {
      const snap = await getDoc(
        doc(db, 'corpTaxBooks', String(corporationId), 'statementLinks', id)
      );
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
