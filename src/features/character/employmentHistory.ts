import { getCharacterCorporationHistory, type CorporationHistoryEntry } from '@/esi/endpoints';
import { conditionalFetch, loadWithCache, type CachedResult } from '@/esi/cache';
import { isNpcCorporationId } from '@/esi/entityIds';

const KEY = 'employment-history';

export function loadEmploymentHistory(
  characterId: number
): Promise<CachedResult<CorporationHistoryEntry[]> | null> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterCorporationHistory(characterId, options)
  );
  return loadWithCache(characterId, KEY, fetchLive, { conditional });
}

export interface EmploymentHistoryRow {
  recordId: number;
  corporationId: number;
  startDate: string;
  tenureSeconds: number;
  ongoing: boolean;
  npc: boolean;
  returned: boolean;
  shortStay: boolean;
  tenureRatio: number;
}

export const SHORT_STAY_SECONDS = 14 * 86_400;

export function deriveEmploymentHistoryRows(
  entries: readonly CorporationHistoryEntry[],
  now: number
): EmploymentHistoryRow[] {
  const sorted = [...entries].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const tenures = sorted.map((entry, i) => {
    const endMs = i === 0 ? now : new Date(sorted[i - 1].start_date).getTime();
    return Math.max(0, (endMs - new Date(entry.start_date).getTime()) / 1000);
  });
  const npc = sorted.map((entry) => isNpcCorporationId(entry.corporation_id));
  const playerTenures = tenures.filter((_, i) => !npc[i]);
  const longest = Math.max(0, ...(playerTenures.length > 0 ? playerTenures : tenures));
  return sorted.map((entry, i) => ({
    recordId: entry.record_id,
    corporationId: entry.corporation_id,
    startDate: entry.start_date,
    tenureSeconds: tenures[i],
    ongoing: i === 0,
    npc: npc[i],
    returned:
      !npc[i] && sorted.slice(i + 1).some((older) => older.corporation_id === entry.corporation_id),
    shortStay: !npc[i] && i > 0 && tenures[i] < SHORT_STAY_SECONDS,
    tenureRatio: longest > 0 ? Math.min(1, tenures[i] / longest) : 0,
  }));
}

export interface EmploymentSummary {
  timeInGameSeconds: number;
  corporationCount: number;
  currentTenureSeconds: number;
  longest: { corporationId: number; seconds: number } | null;
}

export function deriveEmploymentSummary(
  rows: readonly EmploymentHistoryRow[],
  now: number
): EmploymentSummary {
  if (rows.length === 0) {
    return { timeInGameSeconds: 0, corporationCount: 0, currentTenureSeconds: 0, longest: null };
  }
  const earliest = rows[rows.length - 1];
  const playerRows = rows.filter((r) => !r.npc);
  let longest = playerRows[0];
  for (const row of playerRows) if (row.tenureSeconds > longest.tenureSeconds) longest = row;
  return {
    timeInGameSeconds: Math.max(0, (now - new Date(earliest.startDate).getTime()) / 1000),
    corporationCount: new Set(playerRows.map((r) => r.corporationId)).size,
    currentTenureSeconds: rows[0].tenureSeconds,
    longest: longest
      ? { corporationId: longest.corporationId, seconds: longest.tenureSeconds }
      : null,
  };
}
