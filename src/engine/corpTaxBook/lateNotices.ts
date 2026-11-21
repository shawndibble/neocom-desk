/**
 * Late notices (#6294, decision 20261120-235011): a Miner gets one when they are behind — their
 * oldest unpaid day is N days old, or the book's day of the month has come round while they owe
 * from before it — and owe at least the book's minimum; at most one every `cooldownDays`, and
 * none once paid up. An officer's tab issues and mails them (automatic sync never does).
 *
 * A notice is only a record of what was asked (`LateNotice`): its lines are the unpaid days no
 * earlier notice listed, priced as they are billed. Money pays the Miner's oldest day whatever
 * code it carries, and a notice is settled once its days are; what earlier notices still ask is
 * `carried`.
 */
import { newest, type BookView } from './bookView';
import {
  lateNoticeFromStatementDoc,
  listedKeys,
  noticeDocId,
  minerPaymentCode,
  type LateNotice,
  type LateNoticeKind,
} from '../../../functions/src/corpTaxBookLateNotice';
import { isRecord } from '@/engine/guards';
import type { NoticeRules } from './notices';
import { utcDay, utcDaysBetween } from '@/engine/localDay';

export interface NoticePlan {
  /** The notice to issue: the unpaid days no earlier notice listed, priced as they are billed. */
  notice: LateNotice;
  /** Everything the Miner owes now. */
  owed: number;
  /** What of `owed` is not on this notice's lines: days earlier notices listed. */
  carried: number;
}

/** One unpaid day the notice mail lists: what is still owed of it, and where it was mined. */
export interface OwedDay {
  date: string;
  owed: number;
  structureId?: number;
  moonId?: number;
}

/** Every day a Miner owes, oldest first, by place. */
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
  return [...byPlace.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.structureId ?? 0) - (b.structureId ?? 0)
  );
}

/**
 * The notice a Miner would get now, whatever the rules say: undefined when the Miner owes
 * nothing. A `final` notice (closing an account) is stored under `finalNoticeId`.
 */
export function draftNotice(
  view: BookView,
  minerId: string,
  opts: { now?: string; id?: string; kind?: LateNoticeKind } = {}
): NoticePlan | undefined {
  const inner = view.internals.byMiner.get(minerId);
  const row = view.miners.find((m) => m.id === minerId);
  const owes = row?.account.owes;
  if (!inner || !row || !owes) return undefined;
  const { account } = inner;
  const now = opts.now ?? view.input.now;

  const listed = listedKeys(inner.notices);
  const lines = inner.billable.lines.filter((l) => {
    const day = account.day(l.date);
    return day !== undefined && !day.held && !day.settled && !listed.has(l.key);
  });

  // What the new lines still owe: each date's remainder, by the share of it they bill.
  const taxByDate = new Map<string, number>();
  for (const l of lines) taxByDate.set(l.date, (taxByDate.get(l.date) ?? 0) + l.tax);
  let onLines = 0;
  for (const [date, tax] of taxByDate) if (tax > 0) onLines += account.owedOf(date, tax);

  const first = lines[0]?.date ?? owes.oldest;
  const id = noticeDocId(opts.id ?? `notice_${first}_${minerId}_${now.slice(0, 10)}`);
  return {
    notice: {
      id,
      minerId,
      characterIds: row.characterIds,
      kind: opts.kind ?? 'late',
      issuedAt: now,
      // The Miner's one code, which the mail asks for: the server sets it as this, and refuses any other.
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

/** The most recent `day` of a month on or before `today`. */
function lastAnchorDay(today: string, day: number): string {
  const [y, m, d] = today.split('-').map(Number);
  return utcDay(Date.UTC(y, d >= day ? m - 1 : m - 2, day));
}

/**
 * Whether a Miner who owes `owed` since `oldest` is due a notice by the rules, after `lastIssued`.
 * The cooldown holds first, so nobody is billed twice inside it; past it, owing `earlyAt` is due
 * before the Miner is behind by the `after` rule.
 */
export function noticeDue(
  rules: NoticeRules,
  today: string,
  oldest: string,
  lastIssued: string | undefined,
  owed: number
): boolean {
  if (
    lastIssued !== undefined &&
    utcDaysBetween(lastIssued.slice(0, 10), today) < rules.cooldownDays
  )
    return false;
  if (rules.earlyAt !== undefined && owed >= rules.earlyAt) return true;
  if (rules.after.kind === 'behind') return utcDaysBetween(oldest, today) >= rules.after.days;
  const anchor = lastAnchorDay(today, rules.after.day);
  return oldest < anchor && (lastIssued === undefined || lastIssued.slice(0, 10) < anchor);
}

/**
 * Every notice due now, one per Miner who is behind and owes at least the minimum, with no notice
 * in the cooldown. Empty on a calendar book. A closed guest's mail has stopped (#4184).
 */
export function planNotices(
  view: BookView,
  rules: NoticeRules,
  now: string = view.input.now
): NoticePlan[] {
  const closed = new Set(view.input.miners.filter((m) => m.closedAt).map((m) => m.id));
  const today = now.slice(0, 10);
  const plans: NoticePlan[] = [];
  for (const row of view.miners) {
    const owes = row.account.owes;
    if (closed.has(row.id) || !owes || owes.amount < rules.minimum) continue;
    const notices = view.internals.byMiner.get(row.id)?.notices ?? [];
    if (!noticeDue(rules, today, owes.oldest, newest(notices)?.issuedAt, owes.amount)) continue;
    const plan = draftNotice(view, row.id, { now });
    if (plan) plans.push(plan);
  }
  return plans;
}

/**
 * The book's late notices from both places they are stored: `lateNotices` docs, and the
 * `statements` docs older servers wrote them as (`kind: 'notice'`), one per id. A `lateNotices`
 * doc wins: it is the one the server keeps.
 */
export function readLateNotices(
  noticeDocs: readonly unknown[],
  legacyDocs: readonly unknown[]
): LateNotice[] {
  const byId = new Map<string, LateNotice>();
  for (const raw of legacyDocs) {
    const notice = isRecord(raw) ? lateNoticeFromStatementDoc(raw) : undefined;
    if (notice?.id && notice.minerId) byId.set(notice.id, notice);
  }
  for (const raw of noticeDocs) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.minerId !== 'string') continue;
    if (!Array.isArray(raw.lines) || !isRecord(raw.mail)) continue;
    const notice = { ...raw } as unknown as LateNotice & { updatedAt?: unknown };
    delete notice.updatedAt;
    byId.set(notice.id, notice);
  }
  return [...byId.values()];
}
