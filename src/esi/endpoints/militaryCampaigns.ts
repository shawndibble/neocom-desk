import { esiFetch, type EsiResult } from '../client';
import type { EndpointOptions } from './options';

export type MilitaryCampaignState = 'Unspecified' | 'Active' | 'Completed' | 'Expired';

export interface EsiCursor {
  after?: string;
  before?: string;
}

export interface EsiMilitaryCampaign {
  id: string;
  state: MilitaryCampaignState;
  progress: number;
  started?: string;
  finished?: string;
}

export function getMilitaryCampaigns(
  options: EndpointOptions = {}
): Promise<EsiResult<{ campaigns: EsiMilitaryCampaign[] }>> {
  return esiFetch('/military-campaigns', { ...options, endpointId: 'getMilitaryCampaigns' });
}

export interface EsiCampaignObjective {
  id: string;
  state: MilitaryCampaignState;
  progress: number;
  participants: { total: number; committed: number; contributors: number };
  last_modified: string;
  started?: string;
  finished?: string;
}

export interface EsiCampaignObjectivesPage {
  cursor?: EsiCursor;
  objectives: EsiCampaignObjective[];
}

export function getMilitaryCampaignObjectives(
  campaignId: string,
  query: { after?: string; limit?: number } = {},
  options: EndpointOptions = {}
): Promise<EsiResult<EsiCampaignObjectivesPage>> {
  return esiFetch(`/military-campaigns/${campaignId}/objectives`, {
    ...options,
    endpointId: 'getMilitaryCampaignObjectives',
    query: { after: query.after ?? '0', limit: query.limit ?? 100 },
  });
}

export interface EsiCharacterCampaignObjective {
  id: string;
  campaign_id: string;
  is_committed: boolean;
  contributed: number;
  last_modified: string;
}

export interface EsiCharacterCampaignObjectivesPage {
  cursor?: EsiCursor;
  objectives: EsiCharacterCampaignObjective[];
}

export function getCharacterMilitaryCampaignObjectives(
  characterId: number,
  query: { after?: string; limit?: number } = {},
  options: EndpointOptions = {}
): Promise<EsiResult<EsiCharacterCampaignObjectivesPage>> {
  return esiFetch(`/characters/${characterId}/military-campaigns/objectives`, {
    ...options,
    characterId,
    endpointId: 'getCharacterMilitaryCampaignObjectives',
    query: { after: query.after ?? '0', limit: query.limit ?? 100 },
  });
}
