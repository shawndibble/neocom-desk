/**
 * Pure derivations behind the Show Info Corporation tab: a corporation's
 * alliance history as dated stints, and how old it is. `now` is a parameter
 * so both stay deterministic.
 */
import type { CorporationAllianceHistoryEntry } from '@/esi/endpoints';

export interface AllianceHistoryRow {
  recordId: number;
  /** Null for a stretch spent in no alliance. */
  allianceId: number | null;
  startDate: string;
  /** When the next stint began; null for the current one. */
  endDate: string | null;
  /** The alliance has since closed. */
  deleted: boolean;
}

/** Most recent first — the order ESI's records are numbered in, read from the dates. */
export function deriveAllianceHistoryRows(
  entries: readonly CorporationAllianceHistoryEntry[]
): AllianceHistoryRow[] {
  const sorted = [...entries].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return sorted.map((entry, i) => ({
    recordId: entry.record_id,
    allianceId: entry.alliance_id ?? null,
    startDate: entry.start_date,
    endDate: i === 0 ? null : sorted[i - 1].start_date,
    deleted: entry.is_deleted === true,
  }));
}

/** Whole years, then whole months past them; null without a readable founding date. */
export function corporationAge(
  dateFounded: string | undefined,
  now: Date
): { years: number; months: number } | null {
  if (dateFounded === undefined) return null;
  const founded = new Date(dateFounded);
  if (Number.isNaN(founded.getTime())) return null;
  let months =
    (now.getUTCFullYear() - founded.getUTCFullYear()) * 12 +
    (now.getUTCMonth() - founded.getUTCMonth());
  if (now.getUTCDate() < founded.getUTCDate()) months -= 1;
  months = Math.max(0, months);
  return { years: Math.floor(months / 12), months: months % 12 };
}
