// One-time copy for decision 20261120-235011, run once the functions that write `lateNotices` are
// deployed: every Late notice issued before them lives only as a `statements` doc (`kind:
// 'notice'`), its link only in `statementLinks`. This copies each into `lateNotices` /
// `lateNoticeLinks` where it has no copy yet, and deletes the retired Statement-built Miner totals
// (`minerTotals`, #5255). No server read looks at the legacy collections after it. A re-run copies
// nothing new. Run by functions/scripts/backfill-late-notices.mjs.

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { commitInBatches, type BatchOp } from './commitInBatches.js';
import { LATE_NOTICES, LATE_NOTICE_LINKS, STATEMENTS, STATEMENT_LINKS } from './corpTaxBook.js';
import { isFiniteNumber, isRecord } from './guards.js';
import {
  isFinalNoticeId,
  lineKey,
  type LateNotice,
  type LateNoticeLine,
  type LateNoticeLineKind,
  type LateNoticeNames,
} from './corpTaxBookLateNotice.js';

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);
const num = (v: unknown): number | undefined => (isFiniteNumber(v) ? v : undefined);
/** A stored `{ key: string }` map, or undefined when there is none. */
function stringRecord(v: unknown): Record<string, string> | undefined {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(
    Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string')
  );
}
/** A stored `{ typeId: number }` map, or undefined when there is none. */
function numberRecord(v: unknown): Record<number, number> | undefined {
  if (!isRecord(v)) return undefined;
  return Object.fromEntries(
    Object.entries(v).filter((e): e is [string, number] => isFiniteNumber(e[1]))
  );
}

/**
 * Reads a `statements` doc that holds a late notice. Undefined for anything else: a calendar
 * Statement is not a notice, and production holds none.
 */
export function lateNoticeFromStatementDoc(raw: Record<string, unknown>): LateNotice | undefined {
  if (raw.kind !== 'notice') return undefined;
  const id = str(raw.id) ?? '';
  const lines: LateNoticeLine[] = (Array.isArray(raw.lines) ? raw.lines : [])
    .filter(isRecord)
    .flatMap((l): LateNoticeLine[] => {
      const date = str(l.date);
      if (!date) return [];
      const kind: LateNoticeLineKind =
        l.kind === 'late-ore' || l.kind === 'correction' ? l.kind : 'mined';
      const opt = <K extends string, V>(key: K, value: V | undefined) =>
        (value === undefined ? {} : { [key]: value }) as Partial<Record<K, V>>;
      return [
        {
          kind,
          date,
          key: lineKey({ chargeKey: str(l.chargeKey), adjustmentId: str(l.adjustmentId), date }),
          ...opt('characterId', num(l.characterId)),
          ...opt('structureId', num(l.structureId)),
          oreLines: (Array.isArray(l.oreLines) ? l.oreLines : []).filter(isRecord).flatMap((o) => {
            const typeId = num(o.typeId);
            const quantity = num(o.quantity);
            return typeId !== undefined && quantity !== undefined ? [{ typeId, quantity }] : [];
          }),
          ...opt('unitPrices', numberRecord(l.unitPrices)),
          ...opt('priceSources', stringRecord(l.priceSources)),
          estimatedValue: num(l.estimatedValue) ?? 0,
          ...opt('taxPct', num(l.taxPct)),
          ...opt('rateEffectiveFrom', str(l.rateEffectiveFrom)),
          ...opt('reason', str(l.reason)),
          tax: num(l.tax) ?? 0,
        },
      ];
    });
  const lastAt = str(raw.lastMailedAt);
  const issuedBy = num(raw.issuedBy);
  const names: LateNoticeNames = {
    ...(str(raw.minerName) ? { minerName: str(raw.minerName) } : {}),
    ...(str(raw.corporationName) ? { corporationName: str(raw.corporationName) } : {}),
    ...(stringRecord(raw.refineryNames) ? { refineryNames: stringRecord(raw.refineryNames) } : {}),
  };
  return {
    id,
    minerId: str(raw.minerId) ?? '',
    characterIds: (Array.isArray(raw.characterIds) ? raw.characterIds : []).filter(isFiniteNumber),
    kind: isFinalNoticeId(id) ? 'final' : 'late',
    issuedAt: str(raw.issuedAt) ?? '',
    ...(issuedBy !== undefined ? { issuedBy } : {}),
    // An empty code would match every donation's reason: no code is printed instead.
    ...(str(raw.code) ? { code: str(raw.code) } : {}),
    ...(typeof raw.hubId === 'string' && (raw.oreForm === 'compressed' || raw.oreForm === 'raw')
      ? { pricing: { hubId: raw.hubId, oreForm: raw.oreForm } }
      : {}),
    uids: (Array.isArray(raw.uids) ? raw.uids : []).filter(
      (u): u is string => typeof u === 'string'
    ),
    lines,
    listed: lines.reduce((sum, l) => sum + l.tax, 0),
    mail: {
      sent: num(raw.mailsSent) ?? 0,
      ...(lastAt ? { lastAt } : {}),
      manualSent: num(raw.manualRemindersSent) ?? 0,
      remindersStopped: raw.remindersStopped === true,
    },
    ...(Object.keys(names).length > 0 ? { names } : {}),
  };
}

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
