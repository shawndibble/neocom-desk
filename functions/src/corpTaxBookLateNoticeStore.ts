// Firestore side of Late notices (decision 20261120-235011): where a notice, its verify link and
// its token live, how notices are read back from `lateNotices`, and how a notice's mail state
// changes. The edits that call these are in corpTaxBookStore.ts.

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
import { LATE_NOTICES, LATE_NOTICE_LINKS, TOKENS_COLLECTION } from './corpTaxBook.js';
import { NOTICE_ID_FIELD, noticesOfDocs, type LateNotice } from './corpTaxBookLateNotice.js';
import { VERIFY_TOKEN_BYTES } from './verifyToken.js';

type Data = Record<string, unknown>;

/** A change to a notice's mail state. */
export type NoticeMailChange =
  | { kind: 'mailed'; at: string }
  | { kind: 'reminded' }
  | { kind: 'remindersStopped'; stopped: boolean };

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

export const noticeRef = (book: DocumentReference, id: string) =>
  book.collection(LATE_NOTICES).doc(id);

/** A doc with its id, as `noticesOfDocs` reads it. */
const withId = (d: DocumentSnapshot): Data => ({ ...d.data(), id: d.id });

/** A Late notice by id; undefined when there is none. */
export async function readLateNotice(
  reader: Pick<DocReader, 'getAll'>,
  book: DocumentReference,
  id: string
): Promise<LateNotice | undefined> {
  const [doc] = await reader.getAll(noticeRef(book, id));
  const [notice] = doc.exists ? noticesOfDocs([withId(doc)]) : [];
  return notice;
}

/** Narrows a notice read. */
export type NoticeFilter = (collection: CollectionReference) => Query;

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

/** The Late notices a filter finds. */
export async function readNotices(
  reader: DocReader,
  book: DocumentReference,
  where: NoticeFilter = everything
): Promise<LateNotice[]> {
  const snap = await reader.get(where(book.collection(LATE_NOTICES)));
  return noticesOfDocs(snap.docs.map(withId));
}

/** A fresh verify-link token: `VERIFY_TOKEN_BYTES` random bytes, url-safe. */
export const newVerifyToken = (): string => randomBytes(VERIFY_TOKEN_BYTES).toString('base64url');

/**
 * Stores a new Late notice for good: its doc, its link and the token the verify page resolves.
 * Reads nothing: the caller checked the id is free.
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
  tx.create(noticeRef(book, notice.id), { ...notice, updatedAt: FieldValue.serverTimestamp() });
  // Editors only (rules): the Miner and view-only officers never see the token.
  tx.create(book.collection(LATE_NOTICE_LINKS).doc(notice.id), { token });
  tx.create(db.collection(TOKENS_COLLECTION).doc(token), {
    corporationId,
    [NOTICE_ID_FIELD]: notice.id,
    minerId: notice.minerId,
    remindersStopped: false,
    createdAt: now,
  });
  return token;
}

/** Applies a mail change to the notice. */
export function writeNoticeMail(
  tx: Transaction,
  book: DocumentReference,
  notice: LateNotice,
  change: NoticeMailChange
): void {
  tx.update(noticeRef(book, notice.id), {
    ...(change.kind === 'mailed'
      ? { 'mail.sent': FieldValue.increment(1), 'mail.lastAt': change.at }
      : change.kind === 'reminded'
        ? { 'mail.manualSent': FieldValue.increment(1) }
        : { 'mail.remindersStopped': change.stopped }),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
