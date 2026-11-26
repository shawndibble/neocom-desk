import type { Booster, EngineSkill, ScheduledStep } from './types';

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
