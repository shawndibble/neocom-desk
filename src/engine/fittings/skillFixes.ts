import { budgetOverages, fitsResourceBudget } from './skillGaps';
import type { PlanEntry } from '../types';
import type { FittingStats } from './types';

export interface SkillFixCandidate {
  skillTypeId: number;
  fromLevel: number;
}

export interface SkillFix {
  entries: PlanEntry[];
  before: FittingStats;
  after: FittingStats;
}

export interface FindSkillFixesParams {
  before: FittingStats;
  candidates: readonly SkillFixCandidate[];
  stats: (trained: readonly PlanEntry[]) => Promise<FittingStats>;
  yieldFn?: () => Promise<void>;
  isCancelled?: () => boolean;
}

function helps(before: FittingStats, after: FittingStats): boolean {
  const was = budgetOverages(before);
  const now = budgetOverages(after);
  return now.every((o, i) => o <= was[i]!) && now.some((o, i) => o < was[i]!);
}

export async function findSkillFixes({
  before,
  candidates,
  stats,
  yieldFn,
  isCancelled,
}: FindSkillFixesParams): Promise<SkillFix[]> {
  if (fitsResourceBudget(before)) return [];
  let stopped = false;

  async function run(trained: PlanEntry[]): Promise<FittingStats | null> {
    await yieldFn?.();
    if (stopped || isCancelled?.()) {
      stopped = true;
      return null;
    }
    try {
      return await stats(trained);
    } catch {
      return null;
    } finally {
      if (isCancelled?.()) stopped = true;
    }
  }

  async function lowestFitting(
    skill: SkillFixCandidate,
    others: PlanEntry[],
    floor: number,
    atV: FittingStats
  ): Promise<{ level: number; after: FittingStats } | null> {
    for (let level = floor + 1; level < 5; level++) {
      const after = await run(
        sortEntries([...others, { skillTypeID: skill.skillTypeId, targetLevel: level }])
      );
      if (stopped) return null;
      if (after && fitsResourceBudget(after)) return { level, after };
    }
    return { level: 5, after: atV };
  }

  const helpers: { skill: SkillFixCandidate; atV: FittingStats }[] = [];
  for (const skill of candidates) {
    if (skill.fromLevel >= 5) continue;
    const atV = await run([{ skillTypeID: skill.skillTypeId, targetLevel: 5 }]);
    if (stopped) return [];
    if (atV && helps(before, atV)) helpers.push({ skill, atV });
  }

  const singles: SkillFix[] = [];
  for (const { skill, atV } of helpers) {
    if (!fitsResourceBudget(atV)) continue;
    const found = await lowestFitting(skill, [], skill.fromLevel, atV);
    if (stopped || !found) return [];
    singles.push({
      entries: [{ skillTypeID: skill.skillTypeId, targetLevel: found.level }],
      before,
      after: found.after,
    });
  }
  if (singles.length > 0 || helpers.length < 2) return singles;

  const levels = new Map(helpers.map(({ skill }) => [skill.skillTypeId, 5]));
  const entriesOf = () =>
    sortEntries([...levels].map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel })));
  let after = await run(entriesOf());
  if (stopped || !after || !fitsResourceBudget(after)) return [];
  for (const { skill } of helpers) {
    const others = entriesOf().filter((entry) => entry.skillTypeID !== skill.skillTypeId);
    const found = await lowestFitting(skill, others, skill.fromLevel - 1, after);
    if (stopped || !found) return [];
    if (found.level <= skill.fromLevel) levels.delete(skill.skillTypeId);
    else levels.set(skill.skillTypeId, found.level);
    after = found.after;
  }
  return [{ entries: entriesOf(), before, after }];
}

function sortEntries(entries: PlanEntry[]): PlanEntry[] {
  return entries.sort((a, b) => a.skillTypeID - b.skillTypeID);
}
