import type { CampaignObjectiveEntry, MilitaryCampaignEntry } from '@/sde/types';
import type { ObjectiveLive } from '@/engine/market/turnIn';

export type ParticipateState = 'participating' | 'notParticipating' | 'unknown';

export interface JoinedObjective {
  id: string;
  campaignId: string;
  committed: boolean;
  contributed: number;
}

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
  progress: number;
  targetProgress: number;
  filled: number;
}

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

export interface CampaignLive {
  id: string;
  state: ObjectiveLive['state'];
  progress: number;
}

export interface CampaignCompletion {
  campaignId: string;
  title: string;
  factionId: number | null;
  state: CampaignLive['state'];
  completed: number;
  target: number;
  fraction: number;
}

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

export interface ObjectiveEarned {
  isk: number;
  lp: number;
}

export function objectiveEarned(
  objective: CampaignObjectiveEntry,
  contributed: number
): ObjectiveEarned {
  const raw = Number.isFinite(contributed) ? Math.max(0, Math.floor(contributed)) : 0;
  const counted = Math.min(raw, objective.maxPerParticipant ?? Infinity);
  const paid = (rate: { amount: number; interval: number } | undefined) =>
    rate && rate.interval > 0 ? Math.floor(counted / rate.interval) * rate.amount : 0;
  return { isk: paid(objective.isk), lp: paid(objective.lp) };
}
