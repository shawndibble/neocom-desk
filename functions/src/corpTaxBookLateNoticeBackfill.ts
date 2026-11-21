// One-time copy for decision 20261120-235011, run once the functions that write `lateNotices` are
// deployed: every Late notice issued before them lives only as a `statements` doc (`kind:
// 'notice'`), its link only in `statementLinks`. This copies each into `lateNotices` /
// `lateNoticeLinks` where it has no copy yet, and deletes the retired Statement-built Miner totals
// (`minerTotals`, #5255). No server read looks at the legacy collections after it. A re-run copies
// nothing new. Run by functions/scripts/backfill-late-notices.mjs.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import { LATE_NOTICES, LATE_NOTICE_LINKS, STATEMENTS, STATEMENT_LINKS } from './corpTaxBook.js';
import { lateNoticeFromStatementDoc, type LateNotice } from './corpTaxBookLateNotice.js';

type Doc = { id: string; data: Record<string, unknown> };

export interface LateNoticeCopies {
  notices: LateNotice[];
  links: { id: string; token: string }[];
}

/** What to copy: legacy notices and links whose id has no copy in the new collections yet. */
export function planLateNoticeCopies(
  statements: readonly Doc[],
  links: readonly Doc[],
  held: { notices: ReadonlySet<string>; links: ReadonlySet<string> }
): LateNoticeCopies {
  return {
    notices: statements.flatMap(({ id, data }) => {
      const notice = lateNoticeFromStatementDoc({ ...data, id });
      return notice && !held.notices.has(id) ? [notice] : [];
    }),
    links: links.flatMap(({ id, data }) =>
      !held.links.has(id) && typeof data.verifyToken === 'string'
        ? [{ id, token: data.verifyToken }]
        : []
    ),
  };
}

/** Reads one book's legacy and new collections and plans its copies. */
export async function planLateNoticeBackfill(
  db: Firestore,
  corporationId: number
): Promise<LateNoticeCopies> {
  const book = db.collection('corps').doc(String(corporationId));
  const docs = async (name: string) =>
    (await book.collection(name).get()).docs.map((d) => ({ id: d.id, data: d.data() }));
  const ids = async (name: string) =>
    new Set((await book.collection(name).select().get()).docs.map((d) => d.id));
  const [statements, links, notices, noticeLinks] = await Promise.all([
    docs(STATEMENTS),
    docs(STATEMENT_LINKS),
    ids(LATE_NOTICES),
    ids(LATE_NOTICE_LINKS),
  ]);
  return planLateNoticeCopies(statements, links, { notices, links: noticeLinks });
}

/**
 * Writes a plan, creating copies only where none exists: a doc written meanwhile (a notice issued
 * during the run) fails its batch, and a re-run copies what is left.
 */
export async function applyLateNoticeBackfill(
  db: Firestore,
  corporationId: number,
  plan: LateNoticeCopies
): Promise<void> {
  const book = db.collection('corps').doc(String(corporationId));
  const ops: BatchOp[] = [
    ...plan.notices.map(
      (notice): BatchOp =>
        (b) =>
          void b.create(book.collection(LATE_NOTICES).doc(notice.id), {
            ...notice,
            updatedAt: FieldValue.serverTimestamp(),
          })
    ),
    ...plan.links.map(
      ({ id, token }): BatchOp =>
        (b) =>
          void b.create(book.collection(LATE_NOTICE_LINKS).doc(id), { token })
    ),
  ];
  await commitInBatches(db, ops);
}

/** Deletes every retired `minerTotals` doc and their health doc. Returns how many totals. */
export async function retireMinerTotals(db: Firestore, corporationId: number): Promise<number> {
  const book = db.collection('corps').doc(String(corporationId));
  const refs = [
    ...(await book.collection('minerTotals').listDocuments()),
    book.collection('meta').doc('minerTotalsHealth'),
  ];
  await commitInBatches(
    db,
    refs.map(
      (ref): BatchOp =>
        (b) =>
          void b.delete(ref)
    )
  );
  return refs.length - 1;
}
