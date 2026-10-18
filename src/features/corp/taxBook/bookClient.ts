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
import { collection, doc, getDoc, getDocs } from 'firebase/firestore/lite';
import { httpsCallable } from 'firebase/functions';
import { getValidAccessToken } from '@/auth/session';
import type { Miner } from '@/engine/corpTaxBook/charges';
import type { Dismissal } from '@/engine/corpTaxBook/dismissals';
import type { Statement } from '@/engine/corpTaxBook/statements';
import type {
  JournalDonation,
  LastSync,
  SettlePayment,
  SyncExtraction,
  SyncGap,
} from '@/engine/corpTaxBook/sync';
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
  'reverseDismissal',
  'writeOff',
  'rebill',
  'markNotTax',
]);

/**
 * One edit action through `editCorpTaxBookCallable`, e.g.
 * `{ action: 'settleStatements', statementIds }`. Attaches the access token
 * for the live-check actions and for nothing else.
 */
export async function editBook<Out = Record<string, unknown>>(
  characterId: number,
  corporationId: number,
  action: { action: string } & Record<string, unknown>
): Promise<Out> {
  const accessToken = LIVE_CHECK_ACTIONS.has(action.action)
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
