import type { MoonDoc } from '../../../../functions/src/corpTaxBookMoonDocs';
import { LIVE_CHECK_ACTION_NAMES } from '../../../../functions/src/corpTaxBookKinds';
import {
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  RUNNING_ACCOUNTS,
} from '../../../../functions/src/corpTaxBookVersionKeys';
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
import { bookMinersOf, type Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { Declaration } from '@/engine/corpTaxBook/overdue';
import type { Adjustment } from '@/engine/corpTaxBook/adjustments';
import { noticesOfDocs } from '@/engine/corpTaxBook/lateNotices';
import type { RecordedWriteOff } from '@/engine/corpTaxBook/payments';
import { NOTICE_ID_FIELD, type LateNotice } from '../../../../functions/src/corpTaxBookLateNotice';
import type { RunningAccountCheckpoint } from '../../../../functions/src/corpTaxBookCheckpoint';
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
import { openBook, type OpenBook } from './openBook';
import { callSignedIn } from '@/sync/signedInCallable';
import { clearNotFound } from '@/sync/notFoundCache';
import { ensureSignedIn } from '@/sync/syncAuth';

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

export interface BookSummary {
  active: boolean;
  startDate: string;
  divisions: number[];
  divisionNames?: DivisionNames;
  lastSync: LastSync | null;
  structureExpiryHours: Record<string, number>;
}

export interface BookState {
  book: BookSummary;
  miners: Miner[];
  notices: LateNotice[];
  payments: SettlePayment[];
  dismissals: Dismissal[];
  extractions: SyncExtraction[];
  minerPaidThrough?: Map<string, string>;
  writeOffs?: RecordedWriteOff[];
  disputes?: OreDispute[];
}

export interface SyncUpload {
  corporationId: number;
  observed?: ObservedRow[];
  extractions?: SyncExtraction[];
  donations?: JournalDonation[];
  gaps?: SyncGap[];
  uncounted?: UncountedDonation[];
  donationsRead?: boolean;
}

export interface SyncReceipt {
  observedChanged: number;
  extractions: number;
  donationsAdded: number;
}

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

export interface FeederChunkParts {
  extractions: SyncExtraction[];
  feeders: (Pick<BookFeeder, 'corporationId' | 'refineryLabels' | 'refineryStructures'> & {
    lastReadWellAt?: number;
  })[];
  shareMarks?: PopShareMarks['structures'];
}

export async function readBookMiners(characterId: number, corporationId: number): Promise<Miner[]> {
  return asOfficer(characterId, corporationId, async () => {
    const book = await openBook(characterId, corporationId);
    if (!book) return [];
    const [grouped, rows] = await Promise.all([book.list<Miner>('miners'), book.observed()]);
    const characters = [...new Set(rows.map((r) => r.characterId))];
    return bookMinersOf(
      grouped,
      characters.map((c) => `solo:${c}`)
    );
  });
}

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

export const LIVE_CHECK_ACTIONS: ReadonlySet<string> = new Set(LIVE_CHECK_ACTION_NAMES);

function needsLiveToken(action: { action: string } & Record<string, unknown>): boolean {
  return (
    LIVE_CHECK_ACTIONS.has(action.action) ||
    (action.action === 'closeAccount' && (action.credit as { kind?: string })?.kind === 'forfeit')
  );
}

export async function editBook<Out = Record<string, unknown>>(
  characterId: number,
  corporationId: number,
  action: { action: string } & Record<string, unknown>,
  options: { freshToken?: boolean } = {}
): Promise<Out> {
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

export async function readGroupingFlags(
  characterId: number,
  corporationId: number
): Promise<{ conflictIds: Set<number>; declinedIds: Set<number> }> {
  await ensureSignedIn(characterId);
  const meta = (id: string) =>
    getDoc(doc(getSyncFirestore(characterId), 'corps', String(corporationId), 'meta', id))
      .then((snap) => snap.data())
      .catch(() => undefined);
  const [conflicts, answers] = await Promise.all([meta('groupConflicts'), meta('groupingAnswers')]);
  return {
    conflictIds: new Set(groupConflictsFrom(conflicts).map((c) => c.characterId)),
    declinedIds: new Set(
      groupingAnswersFrom(answers)
        .filter((a) => a.answer === 'declined')
        .map((a) => a.characterId)
    ),
  };
}

export async function readBookState(
  characterId: number,
  corporationId: number
): Promise<BookState | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const { list } = book;
  const [miners, notices, payments, dismissals, extractions, writeOffs, disputes] =
    await Promise.all([
      list<Miner>('miners'),
      readNotices(book),
      list<SettlePayment>('payments'),
      list<Dismissal>('dismissals'),
      list<SyncExtraction>('extractions'),
      list<RecordedWriteOff>('writeOffs'),
      list<unknown>('disputes'),
    ]);
  return {
    book: summaryFrom(book.data),
    miners,
    notices,
    payments,
    dismissals,
    extractions,
    writeOffs,
    disputes: readDisputes(disputes),
  };
}

export type { BookSettings };

export async function readBookSettings(
  characterId: number,
  corporationId: number
): Promise<BookSettings | null> {
  await ensureSignedIn(characterId);
  const snap = await getDoc(doc(getSyncFirestore(characterId), 'corps', String(corporationId)));
  return snap.exists() ? settingsFrom(snap.data()) : null;
}

export const settingsFrom = (d: Record<string, unknown>): BookSettings => parseBookSettings(d);

export interface GroupingAnswer {
  characterId: number;
  minerId: string;
  answer: 'confirmed' | 'declined';
  at: string;
  via: 'character' | 'verify-link';
  dismissedAt?: string;
  otherCharacterIds?: number[];
}

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
        ...(typeof a.dismissedAt === 'string' ? { dismissedAt: a.dismissedAt } : {}),
        ...(Array.isArray(a.otherCharacterIds)
          ? {
              otherCharacterIds: a.otherCharacterIds.filter(
                (n): n is number => typeof n === 'number' && Number.isSafeInteger(n)
              ),
            }
          : {}),
      },
    ];
  });
}

export function dismissGroupingAnswer(
  characterId: number,
  corporationId: number,
  answerCharacterId: number
): Promise<{ dismissedAt: string }> {
  return callSignedIn(characterId, 'dismissGroupingAnswer', {
    corporationId,
    characterId: answerCharacterId,
  });
}

export interface GroupConflict {
  characterId: number;
  minerIds: string[];
  at: string;
}

export function groupConflictsFrom(d: Record<string, unknown> | undefined): GroupConflict[] {
  const raw = d?.items;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((c: unknown) => {
    const x = c as Record<string, unknown> | null;
    if (!x || !Number.isSafeInteger(x.characterId) || !Array.isArray(x.minerIds)) return [];
    return [
      {
        characterId: x.characterId as number,
        minerIds: x.minerIds.map(String),
        at: String(x.at ?? ''),
      },
    ];
  });
}

export type FeederPayoutRow = FeederPayout & { id: string };

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
  staleSince?: number;
  staleReason?: string;
  disconnectedAt?: number;
  payeeChangedAt?: number;
  removal?: { startedAt: number; startedBy: number; startedByName: string; effectiveAt?: number };
  viewDismissedAt?: number;
  requestedRatePct?: number;
  agreedRatePct?: number;
  offeredOwnerRatePct?: number;
  payee?: { kind: 'corporation' | 'character'; id: number };
  payeeSetBy?: PayeeSetBy & { characterId: number };
  coveragePeriods: { from: string; to?: string }[];
  ownerRateHistory?: OwnerRateEntry[];
  modeChanges?: FeederModeChange[];
  refineryLabels?: Record<string, StoredRefineryLabel>;
  refineryArchive?: Record<string, RefineryArchive>;
  refinerySystems?: Record<string, number>;
  refineryStructures?: Record<string, StoredRefineryStructure>;
  readsStructureNames?: boolean;
  readsNotifications?: boolean;
  popSharingOptOut?: { by: number; at: number };
  payouts: FeederPayoutRow[];
}

export type FeederDoc = Omit<BookFeeder, 'lastReadWellAt' | 'payouts'> & {
  lastReadWellAt?: number;
};

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

export type BookPart = 'core' | 'observed' | 'ledger' | 'answers' | 'owners';

export interface BookData {
  settings: BookSettings;
  state: BookState;
  observed: ObservedRow[];
  declarations: BookDeclaration[];
  adjustments: Adjustment[];
  toleranceExemptions?: ToleranceExemption[];
  checkpoints?: RunningAccountCheckpoint[];
  feeders?: BookFeeder[];
  groupingAnswers?: GroupingAnswer[];
  groupConflicts?: GroupConflict[];
  scheduledSync?: ScheduledSyncStatus | null;
  uncounted?: UncountedDonation[];
  disputes?: OreDispute[];
  parts: ReadonlySet<BookPart>;
  moon?: { docs: ReadonlyMap<string, MoonDoc>; fromDocs: ReadonlySet<string> };
  feederSummaries?: ReadonlyMap<number, FeederViewSummary>;
  scopedMiner?: string;
}

export async function readGroupingSources(
  characterId: number,
  corporationId: number
): Promise<{ miners: Miner[]; observed: ObservedRow[] } | null> {
  const book = await openBook(characterId, corporationId);
  if (!book) return null;
  const [miners, observed] = await Promise.all([book.list<Miner>('miners'), book.observed()]);
  return { miners, observed };
}

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

export type BookDeclaration = Declaration & {
  recordedBy?: number;
  resolution?: NonNullable<Declaration['resolution']> & { by?: number };
};

export function bookDeclarationOf(raw: Record<string, unknown>): BookDeclaration {
  const { [NOTICE_ID_FIELD]: legacy, ...rest } = raw;
  return { ...rest, noticeId: (raw.noticeId ?? legacy) as string } as unknown as BookDeclaration;
}

export interface Rebill {
  id: string;
  minerId: string;
  fromDate: string;
  reason: string;
  by: number | null;
  at: string;
  memberRebill: boolean;
}

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

export interface AuditEntry {
  id: string;
  at: number;
  by: number | null;
  byName: string;
  via?: string;
  action: string;
  detail: Record<string, unknown>;
}

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
    await clearNotFound(`corps/${corporationId}`);
  }
}

export async function reclaimBook(
  characterId: number,
  corporationId: number
): Promise<{ officersRevoked: number }> {
  const accessToken = await getValidAccessToken(characterId);
  return callSignedIn(characterId, 'reclaimCorpTaxBookCallable', { corporationId, accessToken });
}

export async function deleteBook(characterId: number, corporationId: number): Promise<void> {
  const accessToken = await getValidAccessToken(characterId);
  await callSignedIn(characterId, 'deleteCorpTaxBookCallable', { corporationId, accessToken });
}

export const LEGACY_ISSUE_ACTION = 'issueStatement';

export async function readNotices(book: OpenBook): Promise<LateNotice[]> {
  return noticesOfDocs(
    book.written(LATE_NOTICES) ? await book.list<unknown>(LATE_NOTICES).catch(() => []) : []
  );
}

export async function readCheckpoints(book: OpenBook): Promise<RunningAccountCheckpoint[]> {
  const accounts = book.written(RUNNING_ACCOUNTS)
    ? await book.list<{ snapshot?: RunningAccountCheckpoint }>(RUNNING_ACCOUNTS).catch(() => [])
    : [];
  return accounts.flatMap((a) => a.snapshot ?? []);
}

export async function readVerifyTokens(
  characterId: number,
  corporationId: number,
  noticeIds: readonly string[]
): Promise<Map<string, string>> {
  await ensureSignedIn(characterId);
  const db = getSyncFirestore(characterId);
  const tokens = new Map<string, string>();
  await Promise.all(
    noticeIds.map(async (id) => {
      const token = (
        await getDoc(doc(db, 'corps', String(corporationId), LATE_NOTICE_LINKS, id))
      ).get('token');
      if (typeof token === 'string' && token !== '') tokens.set(id, token);
    })
  );
  return tokens;
}

export async function issueLateNotice(
  characterId: number,
  corporationId: number,
  notice: LateNotice
): Promise<void> {
  await editBook(characterId, corporationId, { action: 'issueLateNotice', notice });
}

export async function recordLateNoticeMail(
  characterId: number,
  corporationId: number,
  mail: { noticeId: string; mailId: number; kind: 'notice' | 'reminder' }
): Promise<void> {
  await editBook(
    characterId,
    corporationId,
    { action: 'recordLateNoticeMail', ...mail },
    { freshToken: true }
  );
}

export { verifyUrl } from '@/engine/corpTaxBook/lateNoticeMail';
