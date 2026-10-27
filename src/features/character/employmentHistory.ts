/**
 * Fetch + cache layer for the Employment History view: a character's
 * corporation history. Public endpoint (`corporationhistory` has no scope in
 * the ESI spec) — no auth-failure state to expose, so `loadWithCache`, not
 * the `-Status` variant.
 */
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
  /** Seconds spent at this corp: gap to the next record, or to `now` for the current one. */
  tenureSeconds: number;
  /** Whether this is the most recent (current) employer. */
  ongoing: boolean;
  /**
   * An NPC corporation: where a pilot sits while idle or passes through between
   * player corps, so it says nothing about their career. Never `returned` or
   * `shortStay`, and left out of the summary's count and longest stay.
   */
  npc: boolean;
  /** The pilot was in this corporation in an earlier record too. */
  returned: boolean;
  /** Stayed under `SHORT_STAY_SECONDS`; never the ongoing stint, which isn't over yet. */
  shortStay: boolean;
  /**
   * `tenureSeconds` over the longest player-corp stint's (every stint's when
   * there is none), capped at 1; sizes the card's bar. A long idle spell in an
   * NPC corp would otherwise shrink every real stint to a sliver.
   */
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
  /** Now minus the earliest start: how long the pilot has existed on record. */
  timeInGameSeconds: number;
  /** Distinct player corporations, so a return counts once and NPC corps not at all. */
  corporationCount: number;
  currentTenureSeconds: number;
  /** The longest single player-corp stint; a tie goes to the more recent one. */
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
