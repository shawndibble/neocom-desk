import type { Booster, EngineSkill, ScheduledStep } from './types';

/**
 * Which scheduled steps a Booster actually speeds up.
 *
 * Two conditions, both required, and each one alone is a wrong answer: the
 * step must train before the Booster lapses, *and* the Booster must raise an
 * attribute that skill trains on. A Booster on intelligence does nothing for a
 * perception skill however early it sits in the queue.
 *
 * Uses the same strict `<` on expiry as `computeSchedule`, so a step beginning
 * at the instant of expiry is not marked — it gets no benefit there either.
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
    expirySeconds: (b.expiresAt.getTime() - startMs) / 1000,
  }));

  steps.forEach((step, index) => {
    const skill = skills.get(step.skillTypeID);
    // A plan can outlive an SDE snapshot; an unknown skill is simply not
    // markable, and throwing here would take down a decoration.
    if (!skill) return;
    const startsAt = step.cumulativeSeconds - step.seconds;
    for (const { bonus, expirySeconds } of windows) {
      if (startsAt >= expirySeconds) continue;
      if ((bonus[skill.primary] ?? 0) > 0 || (bonus[skill.secondary] ?? 0) > 0) {
        marked.add(index);
        return;
      }
    }
  });

  return marked;
}
