import { loadGrantedScopes } from '@/app/grantedScopes';
import type { CampaignLive, JoinedObjective } from '@/engine/campaigns/participation';
import type { ObjectiveLive } from '@/engine/market/turnIn';
import {
  GLOBAL_CACHE_CHARACTER_ID,
  loadWithCache,
  loadWithCacheStatus,
  type CachedResult,
} from '@/esi/cache';
import { walkCursorPages } from '@/esi/cursorPages';
import {
  getCharacterMilitaryCampaignObjectives,
  getMilitaryCampaignObjectives,
  getMilitaryCampaigns,
  type EsiCampaignObjective,
} from '@/esi/endpoints';
import { ESI_REGISTRY } from '@/esi/registry';

export interface CampaignStateSnapshot {
  campaigns: CampaignLive[];
  objectives: (ObjectiveLive & { id: string; campaignId: string })[];
}

export interface CampaignState {
  campaigns: readonly CampaignLive[];
  objectivesById: ReadonlyMap<string, ObjectiveLive>;
  fetchedAt: Date;
  fromCache: boolean;
}

export const CAMPAIGN_STATE_CACHE_KEY = 'military-campaigns';
export const JOINED_OBJECTIVES_CACHE_KEY = 'military-campaign-objectives';

const JOINED_SCOPE = ESI_REGISTRY.getCharacterMilitaryCampaignObjectives.scope;

function body<T>(data: T | null, what: string): T {
  if (data === null) throw new Error(`${what}: ESI sent no body`);
  return data;
}

export async function fetchCampaignState(): Promise<CampaignStateSnapshot> {
  const list = body((await getMilitaryCampaigns()).data, 'military-campaigns').campaigns;
  const active = list.filter((campaign) => campaign.state === 'Active');
  const perCampaign = await Promise.all(
    active.map(async (campaign) => {
      const rows = await walkCursorPages<EsiCampaignObjective>(async (after) => {
        const page = body(
          (await getMilitaryCampaignObjectives(campaign.id, { after })).data,
          'military-campaign objectives'
        );
        return { cursor: page.cursor, items: page.objectives };
      });
      return rows.map((o) => ({
        id: o.id,
        campaignId: campaign.id,
        state: o.state,
        progress: o.progress,
      }));
    })
  );
  return {
    campaigns: list.map(({ id, state, progress }) => ({ id, state, progress })),
    objectives: perCampaign.flat(),
  };
}

export async function loadCampaignState(): Promise<CampaignState | null> {
  const cached: CachedResult<CampaignStateSnapshot> | null = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    CAMPAIGN_STATE_CACHE_KEY,
    fetchCampaignState
  );
  if (!cached) return null;
  return {
    campaigns: cached.data.campaigns,
    objectivesById: new Map(
      cached.data.objectives.map(({ id, state, progress }) => [id, { state, progress }])
    ),
    fetchedAt: cached.fetchedAt,
    fromCache: cached.fromCache,
  };
}

export type JoinedObjectivesRead =
  | { kind: 'needsPermission' }
  | { kind: 'failed' }
  | {
      kind: 'ok';
      joined: ReadonlyMap<string, JoinedObjective>;
      fetchedAt: Date;
      fromCache: boolean;
    };

async function fetchJoined(characterId: number): Promise<JoinedObjective[]> {
  const rows = await walkCursorPages(async (after) => {
    const page = body(
      (await getCharacterMilitaryCampaignObjectives(characterId, { after })).data,
      'character military-campaign objectives'
    );
    return { cursor: page.cursor, items: page.objectives };
  });
  return rows.map((row) => ({
    id: row.id,
    campaignId: row.campaign_id,
    committed: row.is_committed,
    contributed: row.contributed,
  }));
}

export async function loadJoinedObjectives(characterId: number): Promise<JoinedObjectivesRead> {
  const scopes = await loadGrantedScopes(characterId);
  if (!scopes.has(JOINED_SCOPE)) return { kind: 'needsPermission' };
  const { cached, needsReauth } = await loadWithCacheStatus(
    characterId,
    JOINED_OBJECTIVES_CACHE_KEY,
    () => fetchJoined(characterId),
    {
      authFailureEndpoint: 'getCharacterMilitaryCampaignObjectives',
      skipCacheOnAuthFailure: true,
    }
  );
  if (needsReauth) return { kind: 'needsPermission' };
  if (!cached) return { kind: 'failed' };
  return {
    kind: 'ok',
    joined: new Map(cached.data.map((row) => [row.id, row])),
    fetchedAt: cached.fetchedAt,
    fromCache: cached.fromCache,
  };
}
