import type { BookRowView } from '@/engine/corpTaxBook/personal';
import type { DisplayRow } from '../groupRows';

/** The Conflict days a miner can still fix, for the Tax tab: what they would cost, and the one to open first. */
export interface ConflictSummary {
  /** Distinct days (character, date, system): two books contesting one day are one day. */
  days: number;
  /** What the books bill for every listed Conflict line. */
  amount: number;
  /** The Conflict that resolves first: the one Review opens. */
  first: DisplayRow;
  firstCorpName: string;
}

const dayKey = (view: BookRowView) => `${view.characterId}:${view.date}:${view.solarSystemId}`;

/**
 * Sums the Conflict rows in view, earliest-resolving first (one with no date last), so a miner
 * sees the bill a Conflict turns into before the next Statement does. Null when there are none.
 *
 * A day the member has already told the corporation about, or that an officer has answered by
 * waiving the ore's tax, is left out: the prompt asks them to review what they can still fix,
 * and there is nothing left for them to do on those. A `rejected` day stays in — the officer
 * handed it back, so it needs them again.
 */
export function summarizeConflicts(rows: readonly DisplayRow[]): ConflictSummary | null {
  const conflicts = rows
    .flatMap((dr) =>
      dr.corp?.kind === 'row' &&
      dr.corp.view.state === 'conflict' &&
      dr.corp.view.flagged?.state !== 'sent' &&
      dr.corp.view.flagged?.state !== 'dismissed'
        ? [{ dr, corp: dr.corp }]
        : []
    )
    .sort(
      (a, b) =>
        Number(!a.corp.view.resolvesAt) - Number(!b.corp.view.resolvesAt) ||
        (a.corp.view.resolvesAt ?? '').localeCompare(b.corp.view.resolvesAt ?? '')
    );
  const head = conflicts[0];
  if (!head) return null;
  return {
    days: new Set(conflicts.map((c) => dayKey(c.corp.view))).size,
    amount: conflicts.reduce((sum, c) => sum + c.corp.view.billed, 0),
    first: head.dr,
    firstCorpName: head.corp.corpName,
  };
}

/** The other Conflict lines on the same day and system as `view`: every book's, this one's other refineries too. */
export function conflictSiblings(rows: readonly BookRowView[], view: BookRowView): BookRowView[] {
  const key = dayKey(view);
  return rows.filter((r) => r.state === 'conflict' && r.id !== view.id && dayKey(r) === key);
}
