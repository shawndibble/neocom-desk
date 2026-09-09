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

/**
 * Default window before expiry inside which an extractor program is "expiring
 * soon".
 *
 * The *default*, not the rule: every function here takes the window as a
 * trailing argument so the pilot's own lead time can be threaded from the view.
 * It governs more than a badge tone — `sortColoniesByAttention` ranks by it, so
 * the window decides which colony a pilot sees first on opening the page.
 *
 * Deliberately still distinct from `notificationDiffs.ts`'s
 * `EXTRACTOR_EXPIRY_WARNING_MS`, which is the lead time a *notification* fires
 * at. A notification cadence is not a status colour, and the two stay free to
 * diverge.
 */
export const EXPIRING_SOON_WINDOW_MS = 24 * 3_600_000;

/**
 * A program is past its efficient window once its trailing day of output falls
 * under this fraction of its own first day's (`fractionOfFirstDayRate`). On
 * CCP's worked 14-day example that lands a little past day 3: day 3 runs at
 * 0.38 of the first day's rate, day 4 at 0.30.
 *
 * **A display threshold, not a game rule.** CCP's decay curve has no cliff at
 * 0.35 — the curve is smooth, and this number is only a judgement about when a
 * colony is worth walking out to reset. Day 3 is where that judgement is
 * defensible: three-day resets yield 2.46x what a single 14-day program does
 * over the same fortnight, and a 14-day program banks 53% of its entire output
 * in its first three days. So the badge comes to mean "you are past the
 * cadence that would have doubled this planet's throughput" — a claim the user
 * can act on — rather than restating the decay curve, which is falling from
 * the first hour and is nobody's news.
 *
 * A later ticket may well make it a setting. The honest figure lives beside
 * the flag in the pin table's reset-gain column; this is the nudge, not the
 * answer.
 */
export const EFFICIENT_WINDOW_FRACTION = 0.35;

export function extractorState(
  expiryTimeMs: number,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): ExtractorState {
  if (nowMs >= expiryTimeMs) return 'expired';
  if (expiryTimeMs - nowMs <= expiringSoonWindowMs) return 'expiring-soon';
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

export function colonyAttention(
  status: ColonyStatus,
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): ColonyAttention {
  if (status.idle) return 'idle';
  if (status.soonestExpiryMs !== null && status.soonestExpiryMs - nowMs <= expiringSoonWindowMs)
    return 'expiring-soon';
  // `=== true` on purpose: an absent flag means "no program could be
  // projected", which is not the same claim as "not decayed".
  if (status.decayed === true) return 'decayed';
  return 'healthy';
}

/** Exported for callers that need the same ordering outside a sort (e.g. a table column's `sortValue`) without re-deriving it. */
export const ATTENTION_RANK: Record<ColonyAttention, number> = {
  idle: 0,
  'expiring-soon': 1,
  decayed: 2,
  healthy: 3,
};

// `decayed` is deliberately not `warning`: it would then be indistinguishable
// at a glance from `expiring-soon`, which is the more urgent call. `accent`
// reads as "worth a look", which is all the flag claims to be.
//
// Plain string literals rather than `StatChipTone` (the UI layer's type) —
// this stays an engine module with no import from `components/ui`. Every
// value here is one of `StatChipTone`'s members, so a UI caller can index a
// `Record<StatChipTone, ...>` with it directly without a cast.
export const ATTENTION_TONE: Record<ColonyAttention, 'danger' | 'warning' | 'accent' | 'success'> =
  {
    idle: 'danger',
    'expiring-soon': 'warning',
    decayed: 'accent',
    healthy: 'success',
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
  nowMs: number,
  expiringSoonWindowMs: number = EXPIRING_SOON_WINDOW_MS
): T[] {
  return [...colonies].sort((a, b) => {
    const sa = statusOf(a);
    const sb = statusOf(b);
    const rankDiff =
      ATTENTION_RANK[colonyAttention(sa, nowMs, expiringSoonWindowMs)] -
      ATTENTION_RANK[colonyAttention(sb, nowMs, expiringSoonWindowMs)];
    if (rankDiff !== 0) return rankDiff;
    if (sa.soonestExpiryMs === null || sb.soonestExpiryMs === null) return 0;
    return sa.soonestExpiryMs - sb.soonestExpiryMs;
  });
}
