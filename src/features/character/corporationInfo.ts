import type { CorporationAllianceHistoryEntry, CorporationPublicInfo } from '@/esi/endpoints';

export interface AllianceHistoryRow {
  recordId: number;
  allianceId: number | null;
  startDate: string;
  endDate: string | null;
  deleted: boolean;
}

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

export function corporationTaxPercent(
  info: Pick<CorporationPublicInfo, 'tax_rates'>
): number | null {
  const isk = info.tax_rates?.isk;
  return typeof isk === 'number' && Number.isFinite(isk) ? isk : null;
}
