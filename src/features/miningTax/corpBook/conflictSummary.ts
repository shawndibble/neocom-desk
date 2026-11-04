import type { DisplayRow } from '../groupRows';
import { resolvesOn } from './useCorpStateText';

/** The Conflict days a miner can still fix, for the Tax tab's top: what they would cost, and the first to bill. */
export interface ConflictSummary {
  count: number;
  /** What the books bill for every listed Conflict if they are left to resolve. */
  amount: number;
  /** The Conflict that resolves first: the one to open. */
  first: DisplayRow;
  /** `YYYY-MM-DD` the first one is billed. */
  firstDate: string;
  firstCorpName: string;
}

/**
 * Sums the Conflict rows in view, earliest-resolving first, so a miner sees the bill a Conflict
 * turns into before the next Statement does. Null when there are none.
 */
export function summarizeConflicts(rows: readonly DisplayRow[]): ConflictSummary | null {
  const conflicts = rows
    .flatMap((dr) =>
      dr.corp?.kind === 'row' && dr.corp.view.state === 'conflict' ? [{ dr, corp: dr.corp }] : []
    )
    .sort((a, b) => (a.corp.view.resolvesAt ?? '').localeCompare(b.corp.view.resolvesAt ?? ''));
  const head = conflicts[0];
  if (!head) return null;
  return {
    count: conflicts.length,
    amount: conflicts.reduce((sum, c) => sum + c.corp.view.billed, 0),
    first: head.dr,
    firstDate: resolvesOn(head.corp.view.resolvesAt),
    firstCorpName: head.corp.corpName,
  };
}
