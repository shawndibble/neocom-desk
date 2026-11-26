import { bookMiner, newest, type BookView } from './bookView';
import {
  listedKeys,
  noticeDocId,
  minerPaymentCode,
  type LateNotice,
  type LateNoticeKind,
} from '../../../functions/src/corpTaxBookLateNotice';
import type { NoticeRules } from './notices';
import { utcDay, utcDayOf, utcDaysBetween } from '@/engine/localDay';

export interface NoticePlan {
  notice: LateNotice;
  owed: number;
  carried: number;
}

export interface OwedDay {
  date: string;
  owed: number;
  correction?: true;
  structureId?: number;
  moonId?: number;
}

export function owedDays(view: BookView, minerId: string): OwedDay[] {
  const inner = view.internals.byMiner.get(minerId);
  if (!inner) return [];
  const byPlace = new Map<string, OwedDay>();
  for (const d of inner.days) {
    if (d.status !== 'owed' || (d.owed ?? 0) <= 0) continue;
    const key = `${d.date}|${d.structureId}|${d.moonId ?? ''}`;
    const held = byPlace.get(key);
    if (held) held.owed += d.owed!;
    else
      byPlace.set(key, {
        date: d.date,
        owed: d.owed!,
        structureId: d.structureId,
        ...(d.moonId !== undefined ? { moonId: d.moonId } : {}),
      });
  }
  const charges = new Map<string, number>();
  for (const l of inner.billable.lines)
    if (l.kind === 'correction' && l.tax > 0)
      charges.set(l.date, (charges.get(l.date) ?? 0) + inner.account.owedOf(l.date, l.tax));
  const corrections = [...charges]
    .filter(([, owed]) => owed > 0)
    .map(([date, owed]): OwedDay => ({ date, owed, correction: true }));
  return [...corrections, ...byPlace.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.structureId ?? 0) - (b.structureId ?? 0)
  );
}

export function draftNotice(
  view: BookView,
  minerId: string,
  opts: { now?: string; id?: string; kind?: LateNoticeKind } = {}
): NoticePlan | undefined {
  const miner = bookMiner(view, minerId);
  const owes = miner?.account.owes;
  if (!miner || !owes) return undefined;
  const { row, settlement: inner, account } = miner;
  const now = opts.now ?? view.input.now;

  const listed = listedKeys(inner.notices);
  const lines = inner.billable.lines.filter((l) => {
    const day = account.day(l.date);
    return day !== undefined && !day.held && !day.settled && !listed.has(l.key);
  });

  const onLines = lines.reduce((sum, l) => sum + account.owedOf(l.date, l.tax), 0);

  const first = lines[0]?.date ?? owes.oldest;
  const id = noticeDocId(opts.id ?? `notice_${first}_${minerId}_${now.slice(0, 10)}`);
  return {
    notice: {
      id,
      minerId,
      characterIds: row.characterIds,
      kind: opts.kind ?? 'late',
      issuedAt: now,
      code: minerPaymentCode(minerId),
      pricing: { hubId: view.input.hubId, oreForm: view.input.oreForm },
      uids: row.characterIds.map((c) => `char:${c}`),
      lines,
      listed: lines.reduce((sum, l) => sum + l.tax, 0),
      mail: { sent: 0, manualSent: 0, remindersStopped: false },
    },
    owed: owes.amount,
    carried: Math.max(0, owes.amount - onLines),
  };
}

function lastAnchorDay(today: string, day: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return utcDay(Date.UTC(y, d >= day ? m - 1 : m - 2, day));
}

export function noticeDue(
  rules: NoticeRules,
  today: string,
  oldest: string,
  lastIssued: string | undefined,
  owed: number
): boolean {
  if (lastIssued !== undefined && utcDaysBetween(utcDayOf(lastIssued), today) < rules.cooldownDays)
    return false;
  if (rules.earlyAt !== undefined && owed >= rules.earlyAt) return true;
  if (rules.after.kind === 'behind') return utcDaysBetween(oldest, today) >= rules.after.days;
  const anchor = lastAnchorDay(today, rules.after.day);
  return oldest < anchor && (lastIssued === undefined || utcDayOf(lastIssued) < anchor);
}

export function planNotices(
  view: BookView,
  rules: NoticeRules,
  now: string = view.input.now
): NoticePlan[] {
  const closed = new Set(view.input.miners.filter((m) => m.closedAt).map((m) => m.id));
  const today = now.slice(0, 10);
  const plans: NoticePlan[] = [];
  for (const row of view.miners) {
    const inner = view.internals.byMiner.get(row.id);
    const owes = inner?.account.owes;
    if (closed.has(row.id) || !owes || owes.amount < rules.minimum) continue;
    const notices = inner?.notices ?? [];
    if (!noticeDue(rules, today, owes.oldest, newest(notices)?.issuedAt, owes.amount)) continue;
    const plan = draftNotice(view, row.id, { now });
    if (plan) plans.push(plan);
  }
  return plans;
}

export { noticesOfDocs } from '../../../functions/src/corpTaxBookLateNotice';
