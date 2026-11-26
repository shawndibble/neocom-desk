import type { ClaimedTransfer } from '@/engine/corpTaxBook/overdue';
import type {
  BookRowView,
  MemberDeclaration,
  UncreditedDonation,
} from '@/engine/corpTaxBook/personal';
import { characterIdsOfMiner, minerIdFor, type Miner } from '@/engine/corpTaxBook/charges';
import type { LateNotice } from '../../../../../functions/src/corpTaxBookLateNotice';
import { keptDayKey, keptNoticeKey, notPayingDayKey, noticeKey, uncreditedKey } from './notPaying';
import { notOwedPlan, type ResolveProblem } from './outcomes';
import type { InReviewPayment } from '../corpBookStore';

export interface ResolveTarget {
  problem: ResolveProblem;
  hideKey: string;
  transfers?: ClaimedTransfer[];
  payeeName?: string;
  donations?: readonly UncreditedDonation[];
  declaration?: MemberDeclaration;
  answered?: boolean;
  paidSince?: string;
}

export function uncreditedTarget(
  group: readonly (UncreditedDonation & { corporationId: number; corpName: string })[],
  rows: readonly BookRowView[]
): ResolveTarget {
  const [first] = group;
  const days = rows
    .filter(
      (r) =>
        r.corporationId === first.corporationId &&
        group.some((u) => u.characterId === r.characterId && u.covered.includes(r.date))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const noticeId = days.find((r) => r.noticeId !== undefined)?.noticeId;
  const coveredDays = [...new Set(group.flatMap((u) => u.covered))].sort();
  return {
    answered: days.some((r) => r.declaration?.state === 'waiting' || keptBy(r) === 'declaration'),
    problem: {
      kind: 'uncredited',
      corporationId: first.corporationId,
      corpName: first.corpName,
      characterId: first.characterId,
      amount: group.reduce((sum, u) => sum + u.amount, 0),
      ...(days[0] ? { row: days[0] } : {}),
      ...(noticeId !== undefined ? { noticeId } : {}),
      ...(coveredDays.length > 0 ? { days: coveredDays } : {}),
    },
    hideKey: uncreditedKey(
      first.corporationId,
      group.map((u) => u.at)
    ),
    transfers: group.flatMap((u) =>
      u.refId === undefined
        ? []
        : [{ amount: u.amount, at: u.at, journalRef: u.refId, recipient: 'corporation' as const }]
    ),
    donations: group,
  };
}

export function inReviewTarget(group: {
  corporationId: number;
  corpName: string;
  donations: readonly InReviewPayment[];
  noticeId?: string;
}): ResolveTarget {
  const { donations } = group;
  return {
    problem: {
      kind: 'uncredited',
      corporationId: group.corporationId,
      corpName: group.corpName,
      characterId: donations[0].characterId,
      amount: donations.reduce((sum, d) => sum + d.amount, 0),
      ...(group.noticeId !== undefined ? { noticeId: group.noticeId } : {}),
      held: donations.map((d) => ({ id: d.id, characterId: d.characterId })),
    },
    hideKey: uncreditedKey(
      group.corporationId,
      donations.map((d) => d.at)
    ),
    transfers: donations.flatMap((d) =>
      d.refId === undefined
        ? []
        : [{ amount: d.amount, at: d.at, journalRef: d.refId, recipient: 'corporation' as const }]
    ),
    donations: donations.map((d) => ({
      characterId: d.characterId,
      amount: d.amount,
      at: d.at,
      ...(d.refId !== undefined ? { refId: d.refId } : {}),
      covered: [],
    })),
  };
}

const of = (row: BookRowView) => ({
  corporationId: row.corporationId,
  corpName: row.corpName,
  characterId: row.characterId,
  row,
});
const keyOf = (row: BookRowView) => notPayingDayKey(row.corporationId, row.characterId, row.date);

export function bookAsksMore(row: BookRowView): boolean {
  const d = row.dispute;
  if (!d || (d.quantity && d.rate)) return true;
  return d.rate ? d.bookPct > (d.personalPct ?? d.bookPct) : d.bookQuantity > d.personalQuantity;
}

const stillOwed = (row: BookRowView) => row.state === 'billed' || row.state === 'conflict';

export function keptBy(row: BookRowView): 'dispute' | 'declaration' | undefined {
  if (!stillOwed(row)) return undefined;
  if (row.flagged?.state === 'rejected') return 'dispute';
  if (row.declaration?.state === 'rejected' && row.noticeId !== undefined) return 'declaration';
  return undefined;
}

export const figureTarget = (row: BookRowView): ResolveTarget => ({
  problem: { ...of(row), kind: 'figure', bookAsksMore: bookAsksMore(row) },
  hideKey: keyOf(row),
});

export const figureNeedsAnswer = (row: BookRowView): boolean =>
  row.state === 'billed' &&
  row.dispute !== undefined &&
  row.flagged === undefined &&
  bookAsksMore(row) &&
  notOwedPlan(row) !== undefined;

export const conflictTarget = (row: BookRowView, payeeName?: string): ResolveTarget => ({
  problem: { ...of(row), kind: 'conflict' },
  hideKey: keyOf(row),
  ...(payeeName !== undefined ? { payeeName } : {}),
});

function keptHideKey(row: BookRowView, by: 'dispute' | 'declaration'): string {
  const said = by === 'dispute' ? row.flagged : row.declaration;
  const at = said?.at ?? '';
  return by === 'declaration' && row.noticeId !== undefined
    ? keptNoticeKey(row.corporationId, row.noticeId, at)
    : keptDayKey(row.corporationId, row.characterId, row.date, at);
}

export function notPayingHides(hidden: ReadonlySet<string>, row: BookRowView): boolean {
  if (hidden.size === 0) return false;
  const by = keptBy(row);
  if (by) return hidden.has(keptHideKey(row, by));
  if (row.state !== 'billed' && row.state !== 'conflict') return false;
  if (hidden.has(keyOf(row))) return true;
  if (row.noticeId !== undefined && hidden.has(noticeKey(row.corporationId, row.noticeId)))
    return true;
  const sent = row.unlinkedDonation?.at;
  if (sent === undefined) return false;
  const prefix = `uncredited:${row.corporationId}:`;
  for (const key of hidden)
    if (key.startsWith(prefix) && key.slice(prefix.length).split(',').includes(sent)) return true;
  return false;
}

export function proofSenders(
  book: { notices: readonly LateNotice[]; miners: readonly Miner[] } | undefined,
  p: { characterId: number; noticeId?: string; row?: BookRowView }
): number[] {
  if (!book) return [p.characterId];
  const noticeMiner = book.notices.find((n) => n.id === p.noticeId)?.minerId;
  const minerId = noticeMiner ?? p.row?.minerId ?? minerIdFor(p.characterId, [...book.miners]);
  const ids = characterIdsOfMiner(minerId, book.miners);
  return ids.length > 0 ? ids : [p.characterId];
}

export function keptTarget(row: BookRowView, by = keptBy(row) ?? 'dispute'): ResolveTarget {
  const said = by === 'dispute' ? row.flagged : row.declaration;
  const reason = said?.reason;
  const nextStep = said?.nextStep;
  return {
    problem: {
      ...of(row),
      kind: 'kept',
      by,
      ...(nextStep !== undefined ? { nextStep } : {}),
      ...(reason !== undefined ? { reason } : {}),
      ...(row.noticeId !== undefined ? { noticeId: row.noticeId } : {}),
    },
    hideKey: keptHideKey(row, by),
    paidSince: row.date,
  };
}

export function overdueTarget(o: {
  corporationId: number;
  corpName: string;
  noticeId: string;
  characterId: number;
  periodStart: string;
  period: string;
  declaration?: MemberDeclaration;
  row?: BookRowView;
}): ResolveTarget {
  return {
    problem: {
      kind: 'overdue',
      corporationId: o.corporationId,
      corpName: o.corpName,
      characterId: o.characterId,
      noticeId: o.noticeId,
      period: o.period,
      ...(o.row ? { row: o.row } : {}),
    },
    hideKey:
      o.declaration?.state === 'rejected'
        ? keptNoticeKey(o.corporationId, o.noticeId, o.declaration.at)
        : noticeKey(o.corporationId, o.noticeId),
    paidSince: o.periodStart,
    ...(o.declaration?.state === 'rejected' ? { declaration: o.declaration } : {}),
  };
}

export function unlinkedTarget(row: BookRowView): ResolveTarget | undefined {
  if (!row.unlinkedDonation) return undefined;
  return uncreditedTarget(
    [
      {
        ...row.unlinkedDonation,
        corporationId: row.corporationId,
        corpName: row.corpName,
        characterId: row.characterId,
        covered: [row.date],
      },
    ],
    [row]
  );
}

export const billedTarget = (row: BookRowView): ResolveTarget => ({
  problem: { ...of(row), kind: 'billed' },
  hideKey: keyOf(row),
});

export function rowTarget(row: BookRowView, payeeName?: string): ResolveTarget | undefined {
  if (keptBy(row)) return keptTarget(row);
  if (row.state === 'conflict') return conflictTarget(row, payeeName);
  if (row.state === 'billed' && row.dispute !== undefined && row.flagged === undefined)
    return figureTarget(row);
  return row.state === 'billed'
    ? (unlinkedTarget(row) ??
        (row.declaration?.state === 'waiting' ? undefined : billedTarget(row)))
    : undefined;
}
