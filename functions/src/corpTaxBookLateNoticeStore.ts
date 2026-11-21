// Firestore side of Late notices (decision 20261120-235011): where a notice, its verify link and
// its token live, how notices are read back (from `lateNotices`, and from the legacy `statements`
// docs that have no copy yet, until the backfill marks the book), and how a notice's mail state
// changes. The legacy mirror's writes are all in corpTaxBookLegacyMirror.ts. The edits that call
// these are in corpTaxBookStore.ts.

import { randomBytes } from 'node:crypto';
import {
  FieldValue,
  type CollectionReference,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import { LATE_NOTICES, LATE_NOTICE_LINKS, META, TOKENS_COLLECTION } from './corpTaxBook.js';
import {
  NOTICE_ID_FIELD,
  lateNoticeFromStatementDoc,
  legacyStatementDocOf,
  mergeNoticeMail,
  type LateNotice,
} from './corpTaxBookLateNotice.js';
import {
  legacyNoticeRef,
  legacyNotices,
  mirrorIssue,
  mirrorMail,
  type NoticeMailChange,
} from './corpTaxBookLegacyMirror.js';
import { VERIFY_TOKEN_BYTES } from './verifyToken.js';

export type { NoticeMailChange };

type Data = Record<string, unknown>;

/** What reads the book: a transaction, or the database outside one (`dbReader`). */
export interface DocReader {
  get(query: Query): Promise<QuerySnapshot>;
  getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]>;
}

/** The database as a `DocReader`, for reads outside a transaction. */
export const dbReader = (db: Firestore): DocReader => ({
  get: (query) => query.get(),
  getAll: (...refs) => db.getAll(...refs),
});

/**
 * Doc under `meta`: written once the backfill copied every legacy notice of the book into
 * `lateNotices` (corpTaxBookLateNoticeBackfill.ts). From then on no read looks at the legacy docs.
 */
export const BACKFILLED_DOC = 'lateNoticesBackfilled';

/** A Late notice as read, and which of its docs exist: a mail change updates each. */
export interface LoadedNotice {
  notice: LateNotice;
  current: boolean;
  legacy: boolean;
}

const noticeRef = (book: DocumentReference, id: string) => book.collection(LATE_NOTICES).doc(id);

/** A stored `lateNotices` doc as a `LateNotice`: the server's `updatedAt` stamp is not part of it. */
function noticeOf(snap: DocumentSnapshot): LateNotice {
  const { updatedAt: _stamp, ...notice } = snap.data() as LateNotice & { updatedAt?: unknown };
  void _stamp;
  return notice;
}

/**
 * A legacy `statements` doc as the notice it asked as. Production holds only notices there, but an
 * older tab on a book that never switched may still issue a calendar Statement: it is read as a
 * notice too (what it listed, its readers and mail state), so its link and mail keep working.
 */
const fromLegacy = (raw: Data) => lateNoticeFromStatementDoc({ ...raw, kind: 'notice' });

/**
 * A Late notice by id: its `lateNotices` doc, else its legacy doc; undefined when neither holds
 * one. While both do, the mail state is read from both (`mergeNoticeMail`): a change an older tab
 * or a rolled-back function wrote to only one of them still counts.
 */
export async function readLateNotice(
  reader: Pick<DocReader, 'getAll'>,
  book: DocumentReference,
  id: string
): Promise<LoadedNotice | undefined> {
  const [current, legacy] = await reader.getAll(noticeRef(book, id), legacyNoticeRef(book, id));
  const old = legacy.exists ? fromLegacy(legacy.data() ?? {}) : undefined;
  if (!current.exists) return old && { notice: old, current: false, legacy: true };
  const notice = noticeOf(current);
  return {
    notice: old ? { ...notice, mail: mergeNoticeMail(notice.mail, old.mail) } : notice,
    current: true,
    legacy: legacy.exists,
  };
}

/** Narrows a notice read: the same filter on both collections, or one each (`legacy` says which). */
export type NoticeFilter = (collection: CollectionReference, legacy: boolean) => Query;

const everything: NoticeFilter = (collection) => collection;

/** One Miner's notices. */
export const ofMinerFilter =
  (minerId: string): NoticeFilter =>
  (collection) =>
    collection.where('minerId', '==', minerId);

/** The notices that list a Character's own lines. */
export const ofCharacterFilter =
  (characterId: number): NoticeFilter =>
  (collection) =>
    collection.where('characterIds', 'array-contains', characterId);

/**
 * What a filter finds: every `lateNotices` doc, and each legacy doc with no copy there yet (ids
 * first, then only those docs). Once the book is backfilled the legacy docs are not read at all.
 */
async function readBoth(reader: DocReader, book: DocumentReference, where: NoticeFilter) {
  const [current, [marker]] = await Promise.all([
    reader.get(where(book.collection(LATE_NOTICES), false)),
    reader.getAll(book.collection(META).doc(BACKFILLED_DOC)),
  ]);
  if (marker.exists) return { current: current.docs, legacy: [] as DocumentSnapshot[] };
  const held = new Set(current.docs.map((d) => d.id));
  const ids = await reader.get(where(legacyNotices(book), true).select());
  const missing = ids.docs.filter((d) => !held.has(d.id)).map((d) => d.ref);
  const legacy = missing.length > 0 ? await reader.getAll(...missing) : [];
  return { current: current.docs, legacy: legacy.filter((d) => d.exists) };
}

/** The Late notices a filter finds in both collections, once each. */
export async function readNotices(
  reader: DocReader,
  book: DocumentReference,
  where: NoticeFilter = everything
): Promise<LateNotice[]> {
  const { current, legacy } = await readBoth(reader, book, where);
  return [...current.map(noticeOf), ...legacy.flatMap((d) => fromLegacy(d.data() ?? {}) ?? [])];
}

/**
 * The same notices in their legacy shape, for the guards that still read Statement fields
 * (`coversThrough`, `amount`): a calendar Statement an older tab issued is kept as stored.
 */
export async function readNoticeDocs(
  reader: DocReader,
  book: DocumentReference,
  where: NoticeFilter = everything
): Promise<Data[]> {
  const { current, legacy } = await readBoth(reader, book, where);
  return [
    ...current.map((d) => legacyStatementDocOf(noticeOf(d))),
    ...legacy.map((d) => d.data() ?? {}),
  ];
}

/** One notice in its legacy shape (`readNoticeDocs`), by id. */
export async function readNoticeDocById(
  reader: Pick<DocReader, 'getAll'>,
  book: DocumentReference,
  id: string
): Promise<Data | undefined> {
  const [current, legacy] = await reader.getAll(noticeRef(book, id), legacyNoticeRef(book, id));
  if (current.exists) return legacyStatementDocOf(noticeOf(current));
  return legacy.exists ? legacy.data() : undefined;
}

/** A fresh verify-link token: `VERIFY_TOKEN_BYTES` random bytes, url-safe. */
export const newVerifyToken = (): string => randomBytes(VERIFY_TOKEN_BYTES).toString('base64url');

/** Stores a notice's own doc and its link. Reads nothing: the caller checked it is new. */
export function writeLateNoticeDocs(
  tx: Transaction,
  book: DocumentReference,
  notice: LateNotice,
  token: string
): void {
  tx.create(noticeRef(book, notice.id), { ...notice, updatedAt: FieldValue.serverTimestamp() });
  // Editors only (rules): the Miner and view-only officers never see the token.
  tx.create(book.collection(LATE_NOTICE_LINKS).doc(notice.id), { token });
}

/**
 * Stores a new Late notice for good: its doc, its link, the token the verify page resolves, and
 * the legacy mirror. Reads nothing: the caller checked the id is free in both collections.
 */
export function issueLateNoticeDocs(
  tx: Transaction,
  db: Firestore,
  book: DocumentReference,
  corporationId: number,
  notice: LateNotice,
  now: number
): string {
  const token = newVerifyToken();
  writeLateNoticeDocs(tx, book, notice, token);
  writeVerifyToken(tx, db, corporationId, notice, token, now);
  mirrorIssue(tx, book, notice, token);
  return token;
}

/** The token a verify link resolves: which book and notice it names. Function-only. */
export function writeVerifyToken(
  tx: Transaction,
  db: Firestore,
  corporationId: number,
  notice: { id: string; minerId: string },
  token: string,
  now: number
): void {
  tx.create(db.collection(TOKENS_COLLECTION).doc(token), {
    corporationId,
    [NOTICE_ID_FIELD]: notice.id,
    minerId: notice.minerId,
    remindersStopped: false,
    createdAt: now,
  });
}

/** Applies a mail change to every doc that holds the notice. */
export function writeNoticeMail(
  tx: Transaction,
  book: DocumentReference,
  loaded: LoadedNotice,
  change: NoticeMailChange
): void {
  const id = loaded.notice.id;
  if (loaded.current)
    tx.update(noticeRef(book, id), {
      ...(change.kind === 'mailed'
        ? { 'mail.sent': FieldValue.increment(1), 'mail.lastAt': change.at }
        : change.kind === 'reminded'
          ? { 'mail.manualSent': FieldValue.increment(1) }
          : { 'mail.remindersStopped': change.stopped }),
      updatedAt: FieldValue.serverTimestamp(),
    });
  if (loaded.legacy) mirrorMail(tx, book, id, change);
}
