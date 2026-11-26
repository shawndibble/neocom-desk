import type { IndustryActivity } from '@/engine/industry/types';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';

export function reactionCraftEligible(
  activity: IndustryActivity,
  includeReactions: boolean
): boolean {
  return activity === 'reaction' || includeReactions;
}

export function craftScope(activity: IndustryActivity, includeReactions: boolean): MakeMethod[] {
  const scope: MakeMethod[] = ['manufacturing'];
  if (reactionCraftEligible(activity, includeReactions)) scope.push('reaction');
  return scope;
}
