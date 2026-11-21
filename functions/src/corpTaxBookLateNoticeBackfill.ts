// One-off backfill for decision 20261120-235011, step 2: every Late notice issued before the
// `lateNotices` collection existed lives only as a `statements` doc (`kind: 'notice'`), its link
// only in `statementLinks`. This copies each into `lateNotices` / `lateNoticeLinks` once, brings
// the mail state of a copy that already exists level with its legacy doc (`mergeNoticeMail`), and
// marks the book (`BACKFILLED_DOC`), after which no read looks at the legacy docs. It also gives
// each payment stored before `uids` its readers (`planPaymentReaders`). A re-run copies nothing
// new. Run by functions/scripts/backfill-late-notices.mjs.

import { FieldValue, type Firestore, type Timestamp } from 'firebase-admin/firestore';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import {
  LATE_NOTICES,
  LATE_NOTICE_LINKS,
  MINERS,
  PAYMENTS,
  STATEMENTS,
  STATEMENT_LINKS,
} from './corpTaxBook.js';
import { minerUidsOf, paymentUids } from './corpTaxBookClaims.js';
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

/**
 * The payments stored before `uids`, each with its readers: its Miner's (`minerUidsOf`) and its
 * sender's, as every write now stores them (`paymentUids`). One that has `uids` is left alone, so
 * a re-run plans nothing and a grouping's later narrowing is never undone.
 */
export function planPaymentReaders(
  payments: readonly Doc[],
  miners: readonly Doc[]
): { id: string; uids: string[] }[] {
  const byId = new Map(miners.map((m) => [m.id, m.data]));
  return payments.flatMap(({ id, data }) => {
    if ('uids' in data) return [];
    const minerId = typeof data.minerId === 'string' ? data.minerId : undefined;
    const miner = minerId === undefined ? undefined : byId.get(minerId);
    const readers =
      minerId === undefined
        ? []
        : minerUidsOf(
            minerId,
            miner && {
              characterIds: (miner.characterIds as number[] | undefined) ?? [],
              officerClaimed: miner.officerClaimed as number[] | undefined,
              pendingConfirmation: miner.pendingConfirmation as number[] | undefined,
            }
          );
    return [{ id, uids: paymentUids(readers, data.uid) }];
  });
}

/** A payment's planned readers, with the version read, so a write meanwhile is never overwritten. */
export type PaymentReaders = { id: string; uids: string[]; updateTime: Timestamp };

/** Reads one book's payments and groupings and plans the payments' readers. */
export async function planPaymentReadersBackfill(
  db: Firestore,
  corporationId: number
): Promise<PaymentReaders[]> {
  const book = db.collection('corps').doc(String(corporationId));
  const [payments, miners] = await Promise.all([
    book.collection(PAYMENTS).select('minerId', 'uid', 'uids').get(),
    book.collection(MINERS).select('characterIds', 'officerClaimed', 'pendingConfirmation').get(),
  ]);
  const read = new Map(payments.docs.map((d) => [d.id, d.updateTime]));
  const docs = (snap: typeof payments) => snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  return planPaymentReaders(docs(payments), docs(miners)).map((p) => ({
    ...p,
    updateTime: read.get(p.id)!,
  }));
}

/**
 * Writes the readers to each payment as it was read: one written meanwhile (a sync, an officer's
 * placement) fails its batch, and a re-run plans what is left.
 */
export async function applyPaymentReadersBackfill(
  db: Firestore,
  corporationId: number,
  plan: readonly PaymentReaders[]
): Promise<void> {
  const payments = db.collection('corps').doc(String(corporationId)).collection(PAYMENTS);
  await commitInBatches(
    db,
    plan.map(
      ({ id, uids, updateTime }): BatchOp =>
        (b) =>
          void b.update(payments.doc(id), { uids }, { lastUpdateTime: updateTime })
    )
  );
}
