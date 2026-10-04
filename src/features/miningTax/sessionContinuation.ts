import type { MiningTaxAssignmentRecord } from '@/db';
import { allMembers, type DisplayRow } from './groupRows';

/** The EVE (UTC) calendar date after `date`, both `YYYY-MM-DD`. */
export function nextEveDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

export interface SessionContinuation {
  /** The still wholly unassigned entry that looks like the session carrying on past midnight UTC. */
  next: DisplayRow;
  /** The ledger row it would continue — an ordinary row, or a combined one whose last day is the day before. */
  previousRow: DisplayRow;
  /** The previous day's own Assignment: whose Payee, tax % and `groupId` the continuation adopts. */
  previous: MiningTaxAssignmentRecord;
}

/**
 * Entries that look like yesterday's session carrying on after midnight UTC
 * (scope decision 20261004, "continue a session across midnight UTC"). ESI
 * splits the ledger by EVE date, so a pilot whose evening crosses 00:00 UTC
 * gets a second, unassigned entry for the same moon. That entry qualifies when:
 *
 * - none of it is assigned yet, so continuing it decides nothing a pilot
 *   already decided;
 * - the same pilot mined in the same system on the EVE day immediately before;
 * - that day has exactly one Assignment and it is still owed — a paid bill is
 *   a closed session, and a split day has no single Payee to follow.
 *
 * Only ever an offer. Ainsan alone can hold three Payees' moons, so the pilot
 * confirms which session this belongs to unless they turned on the automatic
 * mode themselves.
 */
export function findSessionContinuations(rows: readonly DisplayRow[]): SessionContinuation[] {
  const assignedByDay = new Map<string, { member: MiningTaxAssignmentRecord; dr: DisplayRow }[]>();
  for (const dr of rows) {
    for (const { assignment } of allMembers(dr)) {
      const key = `${assignment.characterId}:${assignment.solarSystemId}:${assignment.date}`;
      const list = assignedByDay.get(key) ?? [];
      list.push({ member: assignment, dr });
      assignedByDay.set(key, list);
    }
  }

  const out: SessionContinuation[] = [];
  for (const dr of rows) {
    if (dr.assignment || dr.row.assignments.length > 0) continue;
    const { characterId } = dr.row;
    const { solarSystemId, date } = dr.row.entry;
    const candidates = [...assignedByDay.entries()]
      .filter(([key]) => {
        const [c, s, d] = key.split(':');
        return Number(c) === characterId && Number(s) === solarSystemId && nextEveDate(d) === date;
      })
      .flatMap(([, list]) => list);
    if (candidates.length !== 1) continue;
    const [{ member, dr: previousRow }] = candidates;
    if (member.status !== 'outstanding' || member.payeeId === undefined) continue;
    out.push({ next: dr, previousRow, previous: member });
  }
  return out;
}
