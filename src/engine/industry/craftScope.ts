/**
 * Craft Scope's reaction eligibility (issue #698): the single answer to
 * "may a reaction-produced material be marked buildable on this plan right
 * now", shared by the recursive engine's own gate, the manual per-item
 * craft/buy toggle, and Craft Sweep's Craft Scope option — so the three can
 * never disagree (docs/context/decisions/20260910-082559-reaction-location-
 * a-second-facility-context-lets-craft.md).
 */
import type { IndustryActivity } from '@/engine/industry/types';
import type { MakeMethod } from '@/engine/industry/makeOrBuy';

/**
 * True when Include Reactions is on for a manufacturing-activity plan, or the
 * plan's own activity is already a reaction — which reuses its own top-level
 * facility for a nested reaction sub-build rather than needing the flag.
 */
export function reactionCraftEligible(
  activity: IndustryActivity,
  includeReactions: boolean
): boolean {
  return activity === 'reaction' || includeReactions;
}

/** Production methods this plan may currently mark buildable. Planetary is out of scope for #698. */
export function craftScope(activity: IndustryActivity, includeReactions: boolean): MakeMethod[] {
  const scope: MakeMethod[] = ['manufacturing'];
  if (reactionCraftEligible(activity, includeReactions)) scope.push('reaction');
  return scope;
}
