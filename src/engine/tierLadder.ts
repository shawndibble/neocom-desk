import type { PlanEntry } from './types';
import type { SkillPrereq } from '@/sde/types';

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

export function alphaCappedEntries(
  entries: readonly PlanEntry[],
  alphaMaxLevel: (skillTypeID: number) => number
): PlanEntry[] {
  return entries.filter((e) => e.targetLevel > alphaMaxLevel(e.skillTypeID));
}
