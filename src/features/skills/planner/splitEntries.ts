import { normalizePlanWithBoundaries } from '@/engine/skills/plan';
import type { EngineSkill, PlanEntry, TrainedSkill } from '@/engine/types';
import { entrySlices } from './entrySlices';

export interface SplitPlan {
  entries: PlanEntry[];
  markers: number[] | undefined;
  changed: boolean;
}

function ownLevelsPerEntry(
  entries: readonly PlanEntry[],
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): number[][] | null {
  const isKnown = (skillTypeID: number) => skills.has(skillTypeID);
  let plan;
  try {
    plan = normalizePlanWithBoundaries(
      entries.filter((e) => isKnown(e.skillTypeID)),
      skills,
      trainedSkills
    );
  } catch {
    return null;
  }

  return entrySlices(entries, plan.entryBoundaries, plan.steps, isKnown).map(
    ({ ownStart, end }) => {
      if (ownStart === -1) return [];
      const levels: number[] = [];
      for (let i = ownStart; i < end; i++) {
        if (plan.steps[i].skillTypeID === plan.steps[ownStart].skillTypeID) {
          levels.push(plan.steps[i].level);
        }
      }
      return levels;
    }
  );
}

export function splitEntriesByLevel(
  entries: readonly PlanEntry[],
  markers: readonly number[] | undefined,
  skills: ReadonlyMap<number, EngineSkill>,
  trainedSkills: ReadonlyMap<number, TrainedSkill>
): SplitPlan {
  const unchanged: SplitPlan = {
    entries: [...entries],
    markers: markers ? [...markers] : undefined,
    changed: false,
  };

  const ownLevels = ownLevelsPerEntry(entries, skills, trainedSkills);
  if (ownLevels === null) return unchanged;

  const split: PlanEntry[] = [];
  const rowsBefore: number[] = [0];
  entries.forEach((entry, i) => {
    const levels = ownLevels[i];
    if (levels.length === 0) split.push(entry);
    else for (const level of levels) split.push({ ...entry, targetLevel: level });
    rowsBefore.push(split.length);
  });

  if (split.length === entries.length) return unchanged;
  return {
    entries: split,
    markers: markers?.map((m) => {
      const position = Number.isFinite(m) ? Math.round(m) : 0;
      return rowsBefore[Math.min(entries.length, Math.max(0, position))];
    }),
    changed: true,
  };
}
