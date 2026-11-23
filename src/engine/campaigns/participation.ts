/**
 * Military Campaign participation (issue #6703): whether a Character pressed
 * **Participate** on a **Campaign Objective**, the Active objectives it is in,
 * and each campaign's completion. Pure: baked objectives
 * (`militaryCampaigns.json`) and ESI's live state are handed in.
 */
import type { CampaignObjectiveEntry, MilitaryCampaignEntry } from '@/sde/types';
import type { ObjectiveLive } from '@/engine/market/turnIn';

/**
 * `unknown` when the Character has not granted the Military Campaigns
 * Permission (or its read failed): never guessed as either answer.
 */
export type ParticipateState = 'participating' | 'notParticipating' | 'unknown';

/** One objective the Character has joined, from ESI's character objective list. */
export interface JoinedObjective {
  id: string;
  campaignId: string;
  /** Participating now; false once it resigned. */
  committed: boolean;
  /** The Character's own cumulative progress. */
  contributed: number;
}

/** `joined` is null when nothing was read (no Permission): `unknown`. */
export function participateState(
  objectiveId: string,
  joined: ReadonlyMap<string, JoinedObjective> | null
): ParticipateState {
  if (joined === null) return 'unknown';
  return joined.get(objectiveId)?.committed ? 'participating' : 'notParticipating';
}

export interface ParticipatingObjective {
  objective: CampaignObjectiveEntry;
  contributed: number;
  /** Community progress and target, and progress as a fraction 0..1. */
  progress: number;
  targetProgress: number;
  filled: number;
}

/**
 * The Active objectives (any type) the Character Participates in, with its
 * contribution, by title. Objectives the SDE has not baked are left out.
 */
export function participatingObjectives(
  objectives: readonly CampaignObjectiveEntry[],
  liveById: ReadonlyMap<string, ObjectiveLive>,
  joined: ReadonlyMap<string, JoinedObjective> | null
): ParticipatingObjective[] {
  if (joined === null) return [];
  return objectives
    .flatMap((objective) => {
      const mine = joined.get(objective.id);
      const live = liveById.get(objective.id);
      if (!mine?.committed || live?.state !== 'Active') return [];
      const target = objective.targetProgress;
      return [
        {
          objective,
          contributed: mine.contributed,
          progress: live.progress,
          targetProgress: target,
          filled: target > 0 ? Math.min(1, Math.max(0, live.progress) / target) : 0,
        },
      ];
    })
    .sort((a, b) => a.objective.title.localeCompare(b.objective.title));
}

/** ESI's live state for one campaign; `progress` counts its completed objectives. */
export interface CampaignLive {
  id: string;
  state: ObjectiveLive['state'];
  progress: number;
}

export interface CampaignCompletion {
  campaignId: string;
  title: string;
  /** The faction running it (the widget's Faction setting filters on it). */
  factionId: number | null;
  state: CampaignLive['state'];
  /** Objectives completed, against the campaign's target. */
  completed: number;
  target: number;
  fraction: number;
}

/** Every campaign ESI lists that the SDE knows, Active ones first, then by title. */
export function campaignCompletions(
  campaigns: readonly MilitaryCampaignEntry[],
  live: readonly CampaignLive[]
): CampaignCompletion[] {
  const byId = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
  return live
    .flatMap((state) => {
      const campaign = byId.get(state.id);
      if (!campaign) return [];
      const target = campaign.targetProgress;
      return [
        {
          campaignId: campaign.id,
          title: campaign.title,
          factionId: campaign.factionId,
          state: state.state,
          completed: state.progress,
          target,
          fraction: target > 0 ? Math.min(1, Math.max(0, state.progress) / target) : 0,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(b.state === 'Active') - Number(a.state === 'Active') ||
        a.title.localeCompare(b.title)
    );
}
