/**
 * Fetch + cache layer for the Employment History view: a character's
 * corporation history. Public endpoint (`corporationhistory` has no scope in
 * the ESI spec) — no auth-failure state to expose, so `loadWithCache`, not
 * the `-Status` variant.
 */
import { getCharacterCorporationHistory, type CorporationHistoryEntry } from '@/esi/endpoints';
import { loadWithCache, type CachedResult } from '@/esi/cache';

const KEY = 'employment-history';

export function loadEmploymentHistory(
  characterId: number
): Promise<CachedResult<CorporationHistoryEntry[]> | null> {
  return loadWithCache(
    characterId,
    KEY,
    async () => (await getCharacterCorporationHistory(characterId)).data
  );
}

export interface EmploymentHistoryRow {
  recordId: number;
  corporationId: number;
  startDate: string;
  /** Seconds spent at this corp: gap to the next record, or to `now` for the current one. */
  tenureSeconds: number;
}

/**
 * Most-recent first. `now` is a parameter so the current corp's still-ongoing
 * tenure is deterministic and testable rather than reading the clock inline.
 */
export function deriveEmploymentHistoryRows(
  entries: readonly CorporationHistoryEntry[],
  now: number
): EmploymentHistoryRow[] {
  const sorted = [...entries].sort((a, b) => b.start_date.localeCompare(a.start_date));
  return sorted.map((entry, i) => {
    const endMs = i === 0 ? now : new Date(sorted[i - 1].start_date).getTime();
    const startMs = new Date(entry.start_date).getTime();
    return {
      recordId: entry.record_id,
      corporationId: entry.corporation_id,
      startDate: entry.start_date,
      tenureSeconds: Math.max(0, (endMs - startMs) / 1000),
    };
  });
}
