// The legacy `statements` mirror of every Late notice (decision 20261120-235011, step 2): older
// open tabs read notices from `statements`, their links from `statementLinks`, so every write to
// a notice is copied there. Step 5 ends the mirror by deleting this file and its calls; nothing
// else in the server writes a notice to the legacy collections.

import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import { FieldValue } from 'firebase-admin/firestore';
import { STATEMENTS, STATEMENT_LINKS } from './corpTaxBook.js';
import { legacyStatementDocOf, type LateNotice } from './corpTaxBookLateNotice.js';

/** A change to a notice's mail state. */
export type NoticeMailChange =
  | { kind: 'mailed'; at: string }
  | { kind: 'reminded' }
  | { kind: 'remindersStopped'; stopped: boolean };

/** The legacy doc a notice is mirrored to: a read falls back to it while the backfill has not run. */
export const legacyNoticeRef = (book: DocumentReference, id: string) =>
  book.collection(STATEMENTS).doc(id);

/** A Miner's legacy notice docs, for reads that list notices from both collections. */
export const legacyNoticesOf = (book: DocumentReference, minerId: string) =>
  book.collection(STATEMENTS).where('minerId', '==', minerId);

/** Every legacy notice doc of a book: what a whole-book read merges with `lateNotices`. */
export const legacyNotices = (book: DocumentReference) => book.collection(STATEMENTS);

/** Mirrors a new notice and its verify link. Reads nothing: the caller checked neither exists. */
export function mirrorIssue(
  tx: Transaction,
  book: DocumentReference,
  notice: LateNotice,
  token: string
): void {
  tx.create(legacyNoticeRef(book, notice.id), legacyStatementDocOf(notice));
  tx.create(book.collection(STATEMENT_LINKS).doc(notice.id), { verifyToken: token });
}

/** Mirrors a mail change onto a notice's legacy doc, which the caller read and found. */
export function mirrorMail(
  tx: Transaction,
  book: DocumentReference,
  id: string,
  change: NoticeMailChange
): void {
  tx.update(
    legacyNoticeRef(book, id),
    change.kind === 'mailed'
      ? { lastMailedAt: change.at, mailsSent: FieldValue.increment(1) }
      : change.kind === 'reminded'
        ? { manualRemindersSent: FieldValue.increment(1) }
        : { remindersStopped: change.stopped }
  );
}
