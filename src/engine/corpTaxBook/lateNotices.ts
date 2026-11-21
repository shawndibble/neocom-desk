/**
 * Late notices on a running account (#6294, decision 20261117-033049). A Miner gets one when
 * they are behind — their oldest unpaid day is N days old, or the book's day of the month has
 * come round while they owe from before it — and owe at least the book's minimum; at most one
 * every `cooldownDays`, and none once paid up. An officer's tab issues and mails them (automatic
 * sync never does), through the same run that issued calendar Statements.
 *
 * A notice is a `statements` doc with `kind: 'notice'`. Its lines are only the unpaid days no
 * earlier notice listed, so the Statement math on the server and on older clients never counts a
 * day twice; what earlier notices (and Statements from before the switch-over) still owe is
 * `carried`. On this client a notice's days stay running days (`buildBookView`): money pays the
 * Miner's oldest day whatever code it carries, and a notice is settled once its days are.
 */
import { newest, type BookView } from './bookView';
import {
  lineKey,
  listedKeys,
  noticeDocId,
  paymentCode,
} from '../../../functions/src/corpTaxBookLateNotice';
import type { NoticeRules } from './notices';
import { daysBetween, type Statement } from './statements';
import { utcDay } from '@/engine/localDay';

export interface NoticePlan {
  minerId: string;
  /** The notice to issue: the unpaid days no earlier notice listed, priced as they are billed. */
  statement: Statement & { kind: 'notice'; characterIds: number[] };
  /** Everything the Miner owes now. */
  owed: number;
  /** What of `owed` is not on this notice's lines: earlier notices' and Statements' days. */
  carried: number;
}

/** One unpaid day the notice mail lists: what is still owed of it, and where it was mined. */
export interface OwedDay {
  date: string;
  owed: number;
  structureId?: number;
  moonId?: number;
  /** A Statement from before the switch-over, owed as one: its first day stands for it. */
  statementId?: string;
}

/** Every day a Miner owes, oldest first: running days by place, then any unpaid older Statement. */
export function owedDays(view: BookView, minerId: string): OwedDay[] {
  const inner = view.internals.byMiner.get(minerId);
  if (!inner) return [];
  const byPlace = new Map<string, OwedDay>();
  for (const d of inner.days) {
    if (d.status !== 'unbilled' || (d.owed ?? 0) <= 0) continue;
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
  const statements: OwedDay[] = inner.statements.flatMap((s) => {
    if (s.kind === 'notice') return [];
    const st = inner.allocation.byStatement.get(s.id);
    return st && !st.settled && st.remaining > 0
      ? [{ date: s.coversFrom, owed: st.remaining, statementId: s.id }]
      : [];
  });
  return [...statements, ...byPlace.values()].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.structureId ?? 0) - (b.structureId ?? 0)
  );
}

/**
 * The notice a Miner would get now, whatever the rules say: undefined when the book is not a
 * running account or the Miner owes nothing. `id` names a final notice (closing an account).
 */
export function draftNotice(
  view: BookView,
  minerId: string,
  opts: { now?: string; id?: string } = {}
): NoticePlan | undefined {
  const inner = view.internals.byMiner.get(minerId);
  const row = view.miners.find((m) => m.id === minerId);
  const running = inner?.running;
  const owes = row?.account?.owes;
  if (!inner || !row || !running || !owes) return undefined;
  const now = opts.now ?? view.input.now;

  const listed = listedKeys(
    inner.statements
      .filter((s) => s.kind === 'notice')
      .map((s) => ({ lines: s.lines.map((l) => ({ key: lineKey(l) })) }))
  );
  const draftLines = inner.draft.kind === 'nothing' ? [] : inner.draft.lines;
  const lines = draftLines.filter((l) => {
    const day = running.byDay.get(l.date);
    return day !== undefined && !day.held && !day.settled && !listed.has(lineKey(l));
  });

  // What the new lines still owe: each date's remainder, by the share of it they bill.
  const taxByDate = new Map<string, number>();
  for (const l of lines) taxByDate.set(l.date, (taxByDate.get(l.date) ?? 0) + l.tax);
  let onLines = 0;
  for (const [date, tax] of taxByDate) {
    const day = running.byDay.get(date)!;
    if (day.tax > 0 && tax > 0) onLines += day.remaining * Math.min(1, tax / day.tax);
  }

  const owing = owedDays(view, minerId);
  const first = lines[0]?.date ?? owes.oldest;
  const last = lines.at(-1)?.date ?? owing.at(-1)?.date ?? first;
  const id = noticeDocId(opts.id ?? `notice_${first}_${minerId}_${now.slice(0, 10)}`);
  return {
    minerId,
    statement: {
      id,
      minerId,
      code: paymentCode(id),
      kind: 'notice',
      periodStart: first,
      periodEnd: last,
      coversFrom: first,
      coversThrough: last,
      issuedAt: now,
      hubId: view.input.hubId,
      oreForm: view.input.oreForm,
      lines,
      amount: lines.reduce((sum, l) => sum + l.tax, 0),
      characterIds: row.characterIds,
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
  if (lastIssued !== undefined && daysBetween(lastIssued.slice(0, 10), today) < rules.cooldownDays)
    return false;
  if (rules.earlyAt !== undefined && owed >= rules.earlyAt) return true;
  if (rules.after.kind === 'behind') return daysBetween(oldest, today) >= rules.after.days;
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
  if (!view.input.runningAccountFrom) return [];
  const closed = new Set(view.input.miners.filter((m) => m.closedAt).map((m) => m.id));
  const today = now.slice(0, 10);
  const plans: NoticePlan[] = [];
  for (const row of view.miners) {
    const owes = row.account?.owes;
    if (closed.has(row.id) || !owes || owes.amount < rules.minimum) continue;
    // The last bill of any kind: a Statement mailed just before the switch-over counts as the
    // first reminder, so no notice follows it within the cooldown.
    const bills = view.internals.byMiner.get(row.id)?.statements ?? [];
    if (!noticeDue(rules, today, owes.oldest, newest(bills)?.issuedAt, owes.amount)) continue;
    const plan = draftNotice(view, row.id, { now });
    if (plan) plans.push(plan);
  }
  return plans;
}
