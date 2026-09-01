/**
 * Colony health from extractor expiry alone. ESI only recalculates a
 * colony's planetary data when it is opened in the game client
 * (https://developers.eveonline.com/docs/guides/pi/) — `expiry_time` is
 * fixed at install and does not drift, but stored quantities and the last
 * cycle start do. So every warning here reads `expiryTimeMs` only; nothing
 * derives from stock levels.
 *
 * Pure: no fetch/DOM/Dexie, no `Date.now()` — `nowMs` is always a parameter,
 * matching `features/industry/jobs.ts`'s `jobProgress(job, nowMs)` convention.
 */
import type { ColonyAttention, ColonyStatus, ExtractorProgram, ExtractorState } from './types';

/** An extractor program is "expiring soon" inside this window before its expiry. */
export const EXPIRING_SOON_WINDOW_MS = 24 * 3_600_000;

export function extractorState(expiryTimeMs: number, nowMs: number): ExtractorState {
  if (nowMs >= expiryTimeMs) return 'expired';
  if (expiryTimeMs - nowMs <= EXPIRING_SOON_WINDOW_MS) return 'expiring-soon';
  return 'active';
}

/** Idle when any extractor program has already expired; soonest expiry across all of them otherwise. */
export function colonyStatus(programs: readonly ExtractorProgram[], nowMs: number): ColonyStatus {
  if (programs.length === 0) return { idle: false, soonestExpiryMs: null };
  return {
    idle: programs.some((program) => nowMs >= program.expiryTimeMs),
    soonestExpiryMs: Math.min(...programs.map((program) => program.expiryTimeMs)),
  };
}

export function colonyAttention(status: ColonyStatus, nowMs: number): ColonyAttention {
  if (status.idle) return 'idle';
  if (status.soonestExpiryMs !== null && status.soonestExpiryMs - nowMs <= EXPIRING_SOON_WINDOW_MS)
    return 'expiring-soon';
  return 'healthy';
}

const ATTENTION_RANK: Record<ColonyAttention, number> = { idle: 0, 'expiring-soon': 1, healthy: 2 };

/**
 * Colonies needing attention first: idle, then soonest-expiring, then
 * healthy/no-extractor colonies last (stable within each group).
 */
export function sortColoniesByAttention<T>(
  colonies: readonly T[],
  statusOf: (colony: T) => ColonyStatus,
  nowMs: number
): T[] {
  return [...colonies].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    const rankDiff =
      ATTENTION_RANK[colonyAttention(sa, nowMs)] - ATTENTION_RANK[colonyAttention(sb, nowMs)];
    if (rankDiff !== 0) return rankDiff;
    if (sa.soonestExpiryMs === null || sb.soonestExpiryMs === null) return 0;
    return sa.soonestExpiryMs - sb.soonestExpiryMs;
  });
}
