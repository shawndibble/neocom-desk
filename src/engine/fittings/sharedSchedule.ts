import type { PlanEntry, PlanStep } from '../types';

type Step = PlanStep & { seconds: number };

const keyOf = (skillTypeID: number, level: number) => `${skillTypeID}:${level}`;

export function splitSharedSchedule<S extends Step>(
  groups: readonly (readonly PlanEntry[])[],
  combined: readonly S[],
  solo: readonly (readonly Step[])[]
): S[][] {
  const index = new Map(combined.map((step, i) => [keyOf(step.skillTypeID, step.level), i]));
  const doneAt = groups.map((entries) =>
    Math.max(-1, ...entries.map((e) => index.get(keyOf(e.skillTypeID, e.targetLevel)) ?? -1))
  );
  const claimOrder = groups.map((_, g) => g).sort((a, b) => doneAt[a] - doneAt[b] || a - b);
  const needs = solo.map((steps) => new Set(steps.map((s) => keyOf(s.skillTypeID, s.level))));
  const split: S[][] = groups.map(() => []);
  for (const step of combined) {
    const key = keyOf(step.skillTypeID, step.level);
    const owner =
      claimOrder.find((g) => needs[g]?.has(key)) ??
      claimOrder.find((g) => groups[g].some((e) => e.skillTypeID === step.skillTypeID)) ??
      claimOrder[0];
    if (owner !== undefined) split[owner].push(step);
  }
  return split;
}
