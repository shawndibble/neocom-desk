// Firestore side of Late notices (decision 20261120-235011): where a notice, its verify link and
// its token live, how a notice is read back (from `lateNotices`, else from its legacy
// `statements` doc), and how its mail state changes. The legacy mirror's writes are all in
// corpTaxBookLegacyMirror.ts. The edits that call these are in corpTaxBookStore.ts.

import { randomBytes } from 'node:crypto';
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type QuerySnapshot,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  NOTICE_ID_FIELD,
  TOKENS_COLLECTION,
} from './corpTaxBook.js';
import { lateNoticeFromStatementDoc, type LateNotice } from './corpTaxBookLateNotice.js';
import {
  legacyNoticeRef,
  mirrorIssue,
  mirrorMail,
  type NoticeMailChange,
} from './corpTaxBookLegacyMirror.js';

export type { NoticeMailChange };

/** What reads docs by ref: a transaction, or the database outside one. */
export interface DocReader {
  getAll(...refs: DocumentReference[]): Promise<DocumentSnapshot[]>;
}

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
const fromLegacy = (raw: Record<string, unknown>) =>
  lateNoticeFromStatementDoc({ ...raw, kind: 'notice' });

/** A Late notice by id: its `lateNotices` doc, else its legacy doc; undefined when neither holds one. */
export async function readLateNotice(
  reader: DocReader,
  book: DocumentReference,
  id: string
): Promise<LoadedNotice | undefined> {
  const [current, legacy] = await reader.getAll(noticeRef(book, id), legacyNoticeRef(book, id));
  const notice = current.exists
    ? noticeOf(current)
    : legacy.exists
      ? fromLegacy(legacy.data() ?? {})
      : undefined;
  return notice && { notice, current: current.exists, legacy: legacy.exists };
}

/** Notices from both collections, once each: a `lateNotices` doc wins over its legacy copy. */
export function mergeNotices(current: QuerySnapshot, legacy: QuerySnapshot): LateNotice[] {
  const byId = new Map<string, LateNotice>();
  for (const d of legacy.docs) {
    const notice = fromLegacy(d.data());
    if (notice) byId.set(d.id, notice);
  }
  for (const d of current.docs) byId.set(d.id, noticeOf(d));
  return [...byId.values()];
}

/** A fresh verify-link token: 32 random bytes, url-safe. */
export const newVerifyToken = (): string => randomBytes(32).toString('base64url');

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
  tx.create(db.collection(TOKENS_COLLECTION).doc(token), {
    corporationId,
    [NOTICE_ID_FIELD]: notice.id,
    minerId: notice.minerId,
    remindersStopped: false,
    createdAt: now,
  });
  mirrorIssue(tx, book, notice, token);
  return token;
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
