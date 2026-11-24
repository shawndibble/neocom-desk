/**
 * Military Campaigns (issue #6703): the public campaign and objective state,
 * and which objectives a Character pressed Participate on. Introduced at
 * compatibility date 2026-08-04 (a lower date answers 404). All three share
 * ESI's `military-campaign` rate group (300 tokens per 15 minutes).
 */
import { esiFetch, type EsiResult } from '../client';
import type { EndpointOptions } from './options';

/** CCP's state for a campaign or objective; only `Active` accepts contributions. */
export type MilitaryCampaignState = 'Unspecified' | 'Active' | 'Completed' | 'Expired';

/** One cursor page's continuation; `after` walks forward and answers an empty page at the end. */
export interface EsiCursor {
  after?: string;
  before?: string;
}

// --- GET /military-campaigns (public) ---

export interface EsiMilitaryCampaign {
  /** UUID, as `militaryCampaigns.json` keys it. */
  id: string;
  state: MilitaryCampaignState;
  /** Campaign Objectives completed so far. */
  progress: number;
  started?: string;
  finished?: string;
}

/** Every campaign CCP still lists, active or not. One small list, no paging. */
export function getMilitaryCampaigns(
  options: EndpointOptions = {}
): Promise<EsiResult<{ campaigns: EsiMilitaryCampaign[] }>> {
  return esiFetch('/military-campaigns', { ...options, endpointId: 'getMilitaryCampaigns' });
}

// --- GET /military-campaigns/{campaign_id}/objectives (public) ---

export interface EsiCampaignObjective {
  id: string;
  state: MilitaryCampaignState;
  /** Community progress, in the objective's units (one item turned in is one). */
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

/** One cursor page of a campaign's objectives; `after` '0' starts at the beginning. */
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

// --- GET /characters/{character_id}/military-campaigns/objectives (esi.activity.char:read) ---

/**
 * An objective the Character has joined. `is_committed` is whether it is
 * Participating now (false once it resigned); `contributed` is its own
 * cumulative progress.
 */
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

/** One cursor page of the objectives the Character has joined; `after` '0' starts. */
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
