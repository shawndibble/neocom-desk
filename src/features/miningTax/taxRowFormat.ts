import { allMembers, formatDateRange, type DisplayRow } from './groupRows';

/** Every date this row covers, earliest first — one entry for an ordinary row, 2+ for a combined one. */
export function dateRangeOf(dr: DisplayRow): string[] {
  const members = allMembers(dr);
  return (members.length > 0 ? members.map((m) => m.row.entry.date) : [dr.row.entry.date]).sort();
}

export function dateLabel(dr: DisplayRow): string {
  return formatDateRange(dateRangeOf(dr));
}

/** The table's own date: a combined range within one year drops the repeated year ("2026-10-03 – 10-04"), the width a long Payee name needs. */
export function shortDateLabel(dr: DisplayRow): string {
  const dates = dateRangeOf(dr);
  const first = dates[0];
  const last = dates.at(-1);
  if (!first || !last || first === last) return first ?? dr.row.entry.date;
  return first.slice(0, 4) === last.slice(0, 4)
    ? `${first} – ${last.slice(5)}`
    : formatDateRange(dates);
}

export function taxOwedOf(dr: DisplayRow): number {
  return allMembers(dr).reduce((sum, m) => sum + m.assignment.taxOwed, 0);
}

/** The ore types a row covers, for the Ore column's icons. */
export function oreTypeIdsOf(dr: DisplayRow): number[] {
  const lines = dr.assignment
    ? allMembers(dr).flatMap((m) => m.assignment.oreLines)
    : dr.row.unassignedOreLines;
  return [...new Set(lines.map((line) => line.typeId))];
}
