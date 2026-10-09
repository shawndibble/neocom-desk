/**
 * Where a Build Plan's reactions are planned, and whether that place can host
 * them (issue #2908). Reactions cannot run in highsec, so the plan warns —
 * the detail hero and the list row both read this one answer.
 */
import type { BuildPlanRecord } from '@/db';
import {
  reactionLocationState,
  type ReactionLocationState,
} from '@/engine/industry/reactionLocation';
import { FACILITY_PRESETS, type IndustryActivity } from '@/engine/industry/types';

export interface PlanReactionLocation {
  state: ReactionLocationState;
  facilityName: string;
  system: { id: number; name: string } | null;
}

/**
 * The place reactions run for this plan: its own Build Location for a
 * reaction-activity plan, the Reaction Location when Include Reactions is on,
 * and null for a plan with no reactions at all.
 */
export function planReactionLocation(
  plan: Pick<
    BuildPlanRecord,
    | 'facility'
    | 'security'
    | 'buildSystemId'
    | 'buildSystemName'
    | 'includeReactions'
    | 'reactionFacility'
    | 'reactionSecurity'
    | 'reactionBuildSystemId'
    | 'reactionBuildSystemName'
  >,
  activity: IndustryActivity
): PlanReactionLocation | null {
  if (activity === 'reaction') {
    const system =
      plan.buildSystemId !== undefined && plan.buildSystemName !== undefined
        ? { id: plan.buildSystemId, name: plan.buildSystemName }
        : null;
    return {
      state: reactionLocationState(plan.security, system !== null),
      facilityName: FACILITY_PRESETS[plan.facility].name,
      system,
    };
  }
  if (!plan.includeReactions) return null;
  const system =
    plan.reactionBuildSystemId !== undefined && plan.reactionBuildSystemName !== undefined
      ? { id: plan.reactionBuildSystemId, name: plan.reactionBuildSystemName }
      : null;
  return {
    // An unchosen location's stored band is only a pricing default (highsec).
    state: reactionLocationState(plan.reactionSecurity ?? 'highsec', system !== null),
    facilityName: FACILITY_PRESETS[plan.reactionFacility ?? 'athanor'].name,
    system,
  };
}
