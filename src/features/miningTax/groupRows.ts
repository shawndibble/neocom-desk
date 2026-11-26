import type { MiningTaxAssignmentRecord } from '@/db';
import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import type { CorpRowInfo } from './corpBook/corpRows';
import type { MoonMiningTaxRow } from './snapshot';

export interface GroupMember {
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord;
}

export interface DisplayRow {
  key: string;
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
  status: MiningTaxRowStatus;
  groupMembers?: GroupMember[];
  corp?: CorpRowInfo;
}

export function allMembers(dr: DisplayRow): GroupMember[] {
  if (!dr.assignment) return [];
  return [{ row: dr.row, assignment: dr.assignment }, ...(dr.groupMembers ?? [])];
}

export function expandCombinedRows(rows: readonly DisplayRow[]): DisplayRow[] {
  return rows.flatMap((dr) =>
    dr.groupMembers
      ? allMembers(dr).map(({ row, assignment }) => ({
          key: assignment.id,
          row,
          assignment,
          status: assignment.status,
          ...(dr.corp ? { corp: dr.corp } : {}),
        }))
      : [dr]
  );
}

const STATUS_PRIORITY: Record<MiningTaxRowStatus, number> = {
  'needs-review': 0,
  outstanding: 1,
  tracked: 2,
  paid: 3,
  dismissed: 4,
  unassigned: 5,
};

export function formatDateRange(sortedDates: readonly string[]): string {
  if (sortedDates.length === 0) return '';
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  return first === last ? first : `${first} – ${last}`;
}

export const SETTLE_UP_REASON_MAX_LENGTH = 40;

function shortDate(date: string): string {
  return date.slice(5);
}

function compactDateRange(sortedDates: readonly string[]): string {
  if (sortedDates.length === 0) return '';
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  return first === last ? shortDate(first) : `${shortDate(first)}/${shortDate(last)}`;
}

export function buildSettleUpReason(
  prefix: string,
  systems: readonly string[],
  sortedDates: readonly string[]
): string {
  const range = compactDateRange(sortedDates);
  const base = range === '' ? prefix : `${prefix} ${range}`;
  const withSystems = systems.length > 0 ? `${base} ${systems.join('/')}` : base;
  return withSystems.length <= SETTLE_UP_REASON_MAX_LENGTH ? withSystems : base;
}

export function worstStatus(statuses: readonly MiningTaxRowStatus[]): MiningTaxRowStatus {
  return statuses.reduce((worst, s) => (STATUS_PRIORITY[s] < STATUS_PRIORITY[worst] ? s : worst));
}

export function flatten(rows: readonly MoonMiningTaxRow[]): DisplayRow[] {
  const byGroup = new Map<string, GroupMember[]>();
  const ungrouped: GroupMember[] = [];
  for (const row of rows) {
    for (const assignment of row.assignments) {
      if (assignment.groupId) {
        const list = byGroup.get(assignment.groupId) ?? [];
        list.push({ row, assignment });
        byGroup.set(assignment.groupId, list);
      } else {
        ungrouped.push({ row, assignment });
      }
    }
  }

  const out: DisplayRow[] = [];
  for (const members of byGroup.values()) {
    if (members.length < 2) {
      ungrouped.push(...members);
      continue;
    }
    const sorted = [...members].sort((a, b) => a.row.entry.date.localeCompare(b.row.entry.date));
    const [primary, ...rest] = sorted;
    out.push({
      key: primary.assignment.id,
      row: primary.row,
      assignment: primary.assignment,
      status: worstStatus(sorted.map((m) => m.assignment.status)),
      groupMembers: rest,
    });
  }
  for (const { row, assignment } of ungrouped) {
    out.push({ key: assignment.id, row, assignment, status: assignment.status });
  }
  for (const row of rows) {
    if (row.unassignedOreLines.length > 0) {
      out.push({
        key: `${row.characterId}:${row.entry.date}:${row.entry.solarSystemId}:unassigned`,
        row,
        assignment: null,
        status: 'unassigned',
      });
    }
  }
  return out;
}
