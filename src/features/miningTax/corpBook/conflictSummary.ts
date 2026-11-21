import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';
import { answeredByMember, isoDay } from './memberFlag';
import { notPayingDayKey } from './resolve/notPaying';

/** The Conflict days a miner can still fix, for the Tax tab: what they would cost, and the one to open first. */
export interface ConflictSummary {
  /** Distinct days (character, date, system): two books contesting one day are one day. */
  days: number;
  /** What the books bill for every listed Conflict line. */
  amount: number;
  /** The Conflict that resolves first: the one Review opens. */
  first: DisplayRow;
  firstCorpName: string;
  /** `YYYY-MM-DD` the first one resolves to its corporation; empty when it carries no date. */
  firstResolvesOn: string;
  /**
   * Of `days`, how many the member has already answered — told the corporation about, or had
   * the ore's tax waived. They stay in `days` and `amount` because the 14-day clock does not
   * stop for a dispute (`CONFLICT_RESOLVE_DAYS`, `attribution.ts`): the day still bills if
   * nobody answers. Equal to `days` means there is nothing left for the member to press.
   */
  waiting: number;
}

const dayKey = (view: BookRowView) => `${view.characterId}:${view.date}:${view.solarSystemId}`;

/**
 * Sums the Conflict rows in view, earliest-resolving first (one with no date last), so a miner
 * sees the bill a Conflict turns into before a Late notice does. Null when there are none.
 *
 * Days the member chose not to pay are left out: they are listed on the quiet line instead.
 *
 * Days the member has already answered are counted in `waiting` but still in `days` and
 * `amount`. Dropping them would have been the obvious way to stop nagging someone who has done
 * all they can — and it would have been wrong: the day keeps resolving to the corporation 14
 * days after it closed whether or not a dispute is open, so hiding it would have replaced a
 * warning with "No moon mining tax outstanding" right up to the day it billed. The caller
 * states the deadline calmly instead.
 */
export function summarizeConflicts(
  rows: readonly DisplayRow[],
  /** What the member chose not to pay (`useNotPaying`): their own answer, so no warning about it. */
  notPaying: ReadonlySet<string> = new Set()
): ConflictSummary | null {
  const conflicts = rows
    .flatMap((dr) =>
      dr.corp?.kind === 'row' &&
      dr.corp.view.state === 'conflict' &&
      !notPaying.has(
        notPayingDayKey(dr.corp.view.corporationId, dr.corp.view.characterId, dr.corp.view.date)
      )
        ? [{ dr, corp: dr.corp }]
        : []
    )
    .sort(
      (a, b) =>
        Number(!a.corp.view.resolvesAt) - Number(!b.corp.view.resolvesAt) ||
        (a.corp.view.resolvesAt ?? '').localeCompare(b.corp.view.resolvesAt ?? '')
    );
  // Lead with one the member can still act on; only when every day is waiting does Review open
  // one of those.
  const head = conflicts.find((c) => !answeredByMember(c.corp.view)) ?? conflicts[0];
  if (!head) return null;
  // Per day, not per line: a day is only waiting once every book contesting it has been
  // answered, so one unanswered line still asks the member to look.
  const byDay = new Map<string, boolean>();
  for (const c of conflicts) {
    const key = dayKey(c.corp.view);
    byDay.set(key, (byDay.get(key) ?? true) && answeredByMember(c.corp.view));
  }
  return {
    days: byDay.size,
    waiting: [...byDay.values()].filter(Boolean).length,
    amount: conflicts.reduce((sum, c) => sum + c.corp.view.billed, 0),
    first: head.dr,
    firstCorpName: head.corp.corpName,
    firstResolvesOn: isoDay(head.corp.view.resolvesAt),
  };
}

/** The other Conflict lines on the same day and system as `view`: every book's, this one's other refineries too. */
export function conflictSiblings(rows: readonly BookRowView[], view: BookRowView): BookRowView[] {
  const key = dayKey(view);
  return rows.filter((r) => r.state === 'conflict' && r.id !== view.id && dayKey(r) === key);
}
