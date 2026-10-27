import type { Booster, EngineSkill, ScheduledStep } from './types';

/**
 * Which scheduled steps a Booster actually speeds up.
 *
 * Three conditions, all required, and each one alone is a wrong answer: the
 * step must train before the Booster lapses, it must end after the Booster
 * begins (a future `startsAt`), *and* the Booster must raise an attribute
 * that skill trains on. A Booster on intelligence does nothing for a
 * perception skill however early it sits in the queue.
 *
 * Uses the same strict `<`/`>` comparisons as `computeSchedule`, so a step
 * beginning at the instant of expiry, or ending at the instant of a future
 * start, is not marked — it gets no benefit there either.
 *
 * Indices are into `steps`.
 */
export function boostedStepIndices(
  steps: readonly ScheduledStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  boosters: readonly Booster[],
  startDate: Date
): Set<number> {
  const marked = new Set<number>();
  if (boosters.length === 0) return marked;

  const startMs = startDate.getTime();
  const windows = boosters.map((b) => ({
    bonus: b.bonus,
    startSeconds: b.startsAt ? (b.startsAt.getTime() - startMs) / 1000 : -Infinity,
    expirySeconds: (b.expiresAt.getTime() - startMs) / 1000,
  }));

  steps.forEach((step, index) => {
    const skill = skills.get(step.skillTypeID);
    // A plan can outlive an SDE snapshot; an unknown skill is simply not
    // markable, and throwing here would take down a decoration.
    if (!skill) return;
    const stepStartsAt = step.cumulativeSeconds - step.seconds;
    for (const { bonus, startSeconds, expirySeconds } of windows) {
      if (stepStartsAt >= expirySeconds) continue;
      if (step.cumulativeSeconds <= startSeconds) continue;
      if ((bonus[skill.primary] ?? 0) > 0 || (bonus[skill.secondary] ?? 0) > 0) {
        marked.add(index);
        return;
      }
    }
  });

  return marked;
}
