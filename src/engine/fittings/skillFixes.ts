/**
 * "Make it fit" by training: the skill levels that bring an over-CPU/PG/
 * calibration Fitting back under budget. Every guess is recalculated whole
 * through the injected `stats` (the Fitting with those levels trained), so a
 * rig drawback skill or a fitting skill counts exactly as the engine has it.
 * Each skill alone comes first, at the lowest level that fits; only when none
 * fits alone are the helpful ones combined, each then lowered as far as the
 * set still fits. Pure.
 */
import { budgetOverages, fitsResourceBudget } from './skillGaps';
import type { PlanEntry } from '../types';
import type { FittingStats } from './types';

export interface SkillFixCandidate {
  skillTypeId: number;
  /** The pilot's level now; 0 when untrained. */
  fromLevel: number;
}

export interface SkillFix {
  /** One skill, or several when none fits alone; skill-id order. */
  entries: PlanEntry[];
  after: FittingStats;
}

export interface FindSkillFixesParams {
  /** The open Fitting's stats, as it stands. */
  before: FittingStats;
  candidates: readonly SkillFixCandidate[];
  /** Whole-fit stats with `trained` raised to their levels. */
  stats: (trained: readonly PlanEntry[]) => Promise<FittingStats>;
  /** Hands the main thread back between calculations. */
  yieldFn?: () => Promise<void>;
  isCancelled?: () => boolean;
}

/** Lowers some overage and raises none. */
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

  /** The lowest level of `skill` above `floor` at which `fits` holds, with the others as given; V is known to fit. */
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
      after: found.after,
    });
  }
  if (singles.length > 0 || helpers.length < 2) return singles;

  // None alone: every helper at V together, then each lowered in turn.
  const levels = new Map(helpers.map(({ skill }) => [skill.skillTypeId, 5]));
  const entriesOf = () =>
    sortEntries([...levels].map(([skillTypeID, targetLevel]) => ({ skillTypeID, targetLevel })));
  let after = await run(entriesOf());
  if (stopped || !after || !fitsResourceBudget(after)) return [];
  for (const { skill } of helpers) {
    const others = entriesOf().filter((entry) => entry.skillTypeID !== skill.skillTypeId);
    const found = await lowestFitting(skill, others, skill.fromLevel - 1, after);
    if (stopped || !found) return [];
    // At the pilot's own level the skill isn't needed at all.
    if (found.level <= skill.fromLevel) levels.delete(skill.skillTypeId);
    else levels.set(skill.skillTypeId, found.level);
    after = found.after;
  }
  return [{ entries: entriesOf(), after }];
}

function sortEntries(entries: PlanEntry[]): PlanEntry[] {
  return entries.sort((a, b) => a.skillTypeID - b.skillTypeID);
}
