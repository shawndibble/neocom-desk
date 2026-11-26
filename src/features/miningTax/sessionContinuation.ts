import { utcDayOf } from '../../../functions/src/timeConstants';
import type { MiningTaxAssignmentRecord } from '@/db';
import { allMembers, type DisplayRow } from './groupRows';

export function nextEveDate(date: string): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return utcDayOf(next.toISOString());
}

export interface SessionContinuation {
  next: DisplayRow;
  previousRow: DisplayRow;
  previous: MiningTaxAssignmentRecord;
  payeeId: string;
}

export function findSessionContinuations(rows: readonly DisplayRow[]): SessionContinuation[] {
  const byFollowingDay = new Map<string, { member: MiningTaxAssignmentRecord; dr: DisplayRow }[]>();
  for (const dr of rows) {
    for (const { assignment } of allMembers(dr)) {
      if (assignment.status === 'dismissed') continue;
      const key = `${assignment.characterId}:${assignment.solarSystemId}:${nextEveDate(assignment.date)}`;
      const list = byFollowingDay.get(key) ?? [];
      list.push({ member: assignment, dr });
      byFollowingDay.set(key, list);
    }
  }

  const out: SessionContinuation[] = [];
  for (const dr of rows) {
    if (dr.assignment || dr.row.assignments.length > 0) continue;
    const { characterId } = dr.row;
    const { solarSystemId, date } = dr.row.entry;
    const candidates = byFollowingDay.get(`${characterId}:${solarSystemId}:${date}`) ?? [];
    if (candidates.length !== 1) continue;
    const [{ member, dr: previousRow }] = candidates;
    if (member.status !== 'outstanding' || member.payeeId === undefined) continue;
    out.push({ next: dr, previousRow, previous: member, payeeId: member.payeeId });
  }
  return out;
}
