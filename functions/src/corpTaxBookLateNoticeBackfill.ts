// One-off backfill for decision 20261120-235011, step 2: every Late notice issued before the
// `lateNotices` collection existed lives only as a `statements` doc (`kind: 'notice'`), its link
// only in `statementLinks`. This copies each into `lateNotices` / `lateNoticeLinks` once, brings
// the mail state of a copy that already exists level with its legacy doc (`mergeNoticeMail`), and
// marks the book (`BACKFILLED_DOC`), after which no read looks at the legacy docs. A re-run copies
// nothing new. Run by functions/scripts/backfill-late-notices.mjs.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import { LATE_NOTICES, LATE_NOTICE_LINKS, STATEMENTS, STATEMENT_LINKS } from './corpTaxBook.js';
import {
  lateNoticeFromStatementDoc,
  mergeNoticeMail,
  type LateNotice,
  type LateNoticeMail,
} from './corpTaxBookLateNotice.js';
import { BACKFILLED_DOC } from './corpTaxBookLateNoticeStore.js';
import { META } from './corpTaxBook.js';

type Doc = { id: string; data: Record<string, unknown> };

export interface LateNoticeCopies {
  notices: LateNotice[];
  links: { id: string; token: string }[];
  /** Copies whose mail state the legacy doc is ahead of, with the state both add up to. */
  mail: { id: string; mail: LateNoticeMail }[];
}

/**
 * What to copy: legacy notices and links whose id has no copy in the new collections yet, and the
 * mail state of each copy its legacy doc is ahead of. `held.notices` maps each copy to its mail.
 */
export function planLateNoticeCopies(
  statements: readonly Doc[],
  links: readonly Doc[],
  held: { notices: ReadonlyMap<string, LateNoticeMail>; links: ReadonlySet<string> }
): LateNoticeCopies {
  const legacy = statements.flatMap(({ id, data }) => {
    const notice = lateNoticeFromStatementDoc({ ...data, id });
    return notice ? [notice] : [];
  });
  return {
    notices: legacy.filter((n) => !held.notices.has(n.id)),
    mail: legacy.flatMap((n) => {
      const copy = held.notices.get(n.id);
      if (!copy) return [];
      const mail = mergeNoticeMail(copy, n.mail);
      return JSON.stringify(mail) === JSON.stringify(mergeNoticeMail(copy, copy))
        ? []
        : [{ id: n.id, mail }];
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
  const [statements, links, notices, noticeLinks] = await Promise.all([
    docs(STATEMENTS),
    docs(STATEMENT_LINKS),
    book.collection(LATE_NOTICES).select('mail').get(),
    book.collection(LATE_NOTICE_LINKS).select().get(),
  ]);
  return planLateNoticeCopies(statements, links, {
    notices: new Map(notices.docs.map((d) => [d.id, d.get('mail') as LateNoticeMail])),
    links: new Set(noticeLinks.docs.map((d) => d.id)),
  });
}

/**
 * Writes a plan, creating copies only where none exists: a doc written meanwhile (a notice issued
 * during the run) fails its batch, and a re-run copies what is left. The book is marked backfilled
 * only once every write landed.
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
    ...plan.mail.map(
      ({ id, mail }): BatchOp =>
        (b) =>
          void b.update(book.collection(LATE_NOTICES).doc(id), {
            mail,
            updatedAt: FieldValue.serverTimestamp(),
          })
    ),
  ];
  await commitInBatches(db, ops);
  await book.collection(META).doc(BACKFILLED_DOC).set({ at: Date.now() });
}
