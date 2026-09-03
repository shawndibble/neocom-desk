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
import { hasYieldBaseline, pastEfficientWindow } from './extraction';
import type { ColonyAttention, ColonyStatus, ExtractorProgram, ExtractorState } from './types';

/** An extractor program is "expiring soon" inside this window before its expiry. */
export const EXPIRING_SOON_WINDOW_MS = 24 * 3_600_000;

/**
 * A program is past its efficient window once its current cycle yields under
 * this fraction of its own first cycle.
 *
 * **A display threshold, not a game rule.** CCP's decay curve has no cliff at
 * 0.5 — the curve is smooth, and this number is only a judgement about when a
 * colony is worth walking out to reset. A later ticket may well make it a
 * setting. The honest figure lives beside the flag in the pin table's
 * reset-gain column; this is the nudge, not the answer.
 */
export const EFFICIENT_WINDOW_FRACTION = 0.5;

export function extractorState(expiryTimeMs: number, nowMs: number): ExtractorState {
  if (nowMs >= expiryTimeMs) return 'expired';
  if (expiryTimeMs - nowMs <= EXPIRING_SOON_WINDOW_MS) return 'expiring-soon';
  return 'active';
}

/**
 * Idle when any extractor program has already expired; soonest expiry across
 * all of them otherwise. `decayed` summarises the yield curve across the
 * colony: true only when *every* projectable program is past the efficient
 * window, so one freshly-reset extractor keeps the colony off the flag.
 * Programs with no yield baseline are skipped rather than counted as fresh,
 * and a colony where none can be projected reports no `decayed` key at all.
 */
export function colonyStatus(programs: readonly ExtractorProgram[], nowMs: number): ColonyStatus {
  if (programs.length === 0) return { idle: false, soonestExpiryMs: null };
  const projectable = programs.filter(hasYieldBaseline);
  return {
    idle: programs.some((program) => nowMs >= program.expiryTimeMs),
    soonestExpiryMs: Math.min(...programs.map((program) => program.expiryTimeMs)),
    ...(projectable.length > 0
      ? {
          decayed: projectable.every((program) =>
            pastEfficientWindow(program, nowMs, EFFICIENT_WINDOW_FRACTION)
          ),
        }
      : {}),
  };
}

export function colonyAttention(status: ColonyStatus, nowMs: number): ColonyAttention {
  if (status.idle) return 'idle';
  if (status.soonestExpiryMs !== null && status.soonestExpiryMs - nowMs <= EXPIRING_SOON_WINDOW_MS)
    return 'expiring-soon';
  // `=== true` on purpose: an absent flag means "no program could be
  // projected", which is not the same claim as "not decayed".
  if (status.decayed === true) return 'decayed';
  return 'healthy';
}

const ATTENTION_RANK: Record<ColonyAttention, number> = {
  idle: 0,
  'expiring-soon': 1,
  decayed: 2,
  healthy: 3,
};

/**
 * Colonies needing attention first: idle, then soonest-expiring, then decayed
 * — a colony still running but well down its curve is worth a trip before a
 * healthy one, and never before one that has actually stopped — then every
 * other colony last as one group. A healthy colony and a no-extractor colony
 * are not distinguished from each other, so their relative order within that
 * trailing group is whatever `colonies` was already in (stable sort), not a
 * further "no-extractor after healthy" ordering.
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
