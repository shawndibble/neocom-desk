/**
 * Flattens Mining Ledger Entries + their Assignments into one row per table
 * row, collapsing a joined group (issue #523's "join entries" — 2+
 * Assignments sharing a `groupId`) into a single combined `DisplayRow`.
 * Pulled out of `MoonMiningTax.tsx` so this grouping logic (worst-status
 * priority, the one-member-is-ungrouped rule) is unit-testable without the
 * route's ESI/Dexie-backed snapshot loading.
 */
import type { MiningTaxAssignmentRecord } from '@/db';
import type { MiningTaxRowStatus } from '@/engine/miningTax/rowStatus';
import type { MoonMiningTaxRow } from './snapshot';

export interface GroupMember {
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord;
}

/** One flattened table row: an entry's covering Assignment, or its still-unassigned residual. */
export interface DisplayRow {
  key: string;
  row: MoonMiningTaxRow;
  assignment: MiningTaxAssignmentRecord | null;
  status: MiningTaxRowStatus;
  /**
   * Present only for a real join (2+ Assignments sharing a `groupId`) — the
   * other member(s) beyond `row`/`assignment` above. A `groupId` shared by
   * only one surviving member (its sibling deleted, or a sync race) has
   * nothing to combine with, so it renders as an ordinary row instead
   * (`flatten` below).
   */
  groupMembers?: GroupMember[];
}

/** Every Assignment this display row represents — the lone one for an ordinary row, or the whole group for a joined one. Empty for the unassigned-residual row (no Assignment at all). */
export function allMembers(dr: DisplayRow): GroupMember[] {
  if (!dr.assignment) return [];
  return [{ row: dr.row, assignment: dr.assignment }, ...(dr.groupMembers ?? [])];
}

// Worst-first: a joined group's combined status is whichever member most
// needs attention, so a group with one outstanding and one paid member still
// shows (and filters) as Outstanding rather than quietly reading as Paid.
const STATUS_PRIORITY: Record<MiningTaxRowStatus, number> = {
  'needs-review': 0,
  outstanding: 1,
  paid: 2,
  dismissed: 3,
  unassigned: 4,
};

/** "2026-09-04 – 2026-09-06" for a span of EVE dates (already sorted, earliest first), or the one date on its own. Shared by the table's Date column and the Settle-up dialog so both show a span the same way. */
export function formatDateRange(sortedDates: readonly string[]): string {
  if (sortedDates.length === 0) return '';
  const first = sortedDates[0];
  const last = sortedDates[sortedDates.length - 1];
  return first === last ? first : `${first} – ${last}`;
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
