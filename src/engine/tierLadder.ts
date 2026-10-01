/**
 * A tier ladder: five bundles of skill levels, each tier a step up the last —
 * the shape of both a ship's Mastery tiers I–V and a Certificate's grades
 * Basic–Elite (CCP assembles masteries from certificates). One grading rule
 * for both, so a pilot is never told a ladder is reached on one screen and
 * not on another.
 */
import type { PlanEntry } from './types';
import type { SkillPrereq } from '@/sde/types';

/**
 * Highest tier fully trained, walking tiers in order and stopping at the
 * first that is unmet — or empty: a hull with no tier V skills tops out at IV
 * rather than reading as Mastery V. (A certificate never has an empty grade;
 * the SDE build fails if one appears.)
 */
export function tiersReached(
  tiers: readonly (readonly SkillPrereq[])[] | undefined,
  trainedLevel: (skillTypeID: number) => number
): number {
  let reached = 0;
  for (const tier of tiers ?? []) {
    if (tier.length === 0) break;
    if (tier.some((p) => trainedLevel(p.skillTypeID) < p.level)) break;
    reached++;
  }
  return reached;
}

/**
 * The entries an Alpha clone can't train to: a target above the skill's
 * Alpha cap, where no cap at all (0) means Alphas can't train the skill.
 */
export function alphaCappedEntries(
  entries: readonly PlanEntry[],
  alphaMaxLevel: (skillTypeID: number) => number
): PlanEntry[] {
  return entries.filter((e) => e.targetLevel > alphaMaxLevel(e.skillTypeID));
}
