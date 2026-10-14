/**
 * Fetch + cache layer for the Employment History view: a character's
 * corporation history. Public endpoint (`corporationhistory` has no scope in
 * the ESI spec) — no auth-failure state to expose, so `loadWithCache`, not
 * the `-Status` variant.
 */
import { getCharacterCorporationHistory, type CorporationHistoryEntry } from '@/esi/endpoints';
import { conditionalFetch, loadWithCache, type CachedResult } from '@/esi/cache';

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
  /** Seconds spent at this corp: gap to the next record, or to `now` for the current one. */
  tenureSeconds: number;
  /** Whether this is the most recent (current) employer. */
  ongoing: boolean;
  /** The pilot was in this corporation in an earlier record too. */
  returned: boolean;
  /** Stayed under `SHORT_STAY_SECONDS`; never the ongoing stint, which isn't over yet. */
  shortStay: boolean;
  /** `tenureSeconds` over the longest stint's, 0..1; sizes the card's bar. */
  tenureRatio: number;
}

export const SHORT_STAY_SECONDS = 14 * 86_400;

/**
 * Most-recent first. `now` is a parameter so the current corp's still-ongoing
 * tenure is deterministic and testable rather than reading the clock inline.
 */
export function deriveEmploymentHistoryRows(
  entries: readonly CorporationHistoryEntry[],
  now: number
): EmploymentHistoryRow[] {
  const sorted = [...entries].sort((a, b) => b.start_date.localeCompare(a.start_date));
  const tenures = sorted.map((entry, i) => {
    const endMs = i === 0 ? now : new Date(sorted[i - 1].start_date).getTime();
    return Math.max(0, (endMs - new Date(entry.start_date).getTime()) / 1000);
  });
  const longest = Math.max(0, ...tenures);
  return sorted.map((entry, i) => ({
    recordId: entry.record_id,
    corporationId: entry.corporation_id,
    startDate: entry.start_date,
    tenureSeconds: tenures[i],
    ongoing: i === 0,
    returned: sorted.slice(i + 1).some((older) => older.corporation_id === entry.corporation_id),
    shortStay: i > 0 && tenures[i] < SHORT_STAY_SECONDS,
    tenureRatio: longest > 0 ? tenures[i] / longest : 0,
  }));
}

export interface EmploymentSummary {
  /** Now minus the earliest start: how long the pilot has existed on record. */
  timeInGameSeconds: number;
  /** Distinct corporations, so a return counts once. */
  corporationCount: number;
  currentTenureSeconds: number;
  /** The longest single stint; a tie goes to the more recent one. */
  longest: { corporationId: number; seconds: number } | null;
}

/** Headline figures for the tiles above the timeline. `rows` is most-recent first. */
export function deriveEmploymentSummary(
  rows: readonly EmploymentHistoryRow[],
  now: number
): EmploymentSummary {
  if (rows.length === 0) {
    return { timeInGameSeconds: 0, corporationCount: 0, currentTenureSeconds: 0, longest: null };
  }
  const earliest = rows[rows.length - 1];
  let longest = rows[0];
  for (const row of rows) if (row.tenureSeconds > longest.tenureSeconds) longest = row;
  return {
    timeInGameSeconds: Math.max(0, (now - new Date(earliest.startDate).getTime()) / 1000),
    corporationCount: new Set(rows.map((r) => r.corporationId)).size,
    currentTenureSeconds: rows[0].tenureSeconds,
    longest: { corporationId: longest.corporationId, seconds: longest.tenureSeconds },
  };
}
