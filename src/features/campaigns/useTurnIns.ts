import { useCallback } from 'react';
import { useCharacterLacksEndpoints } from '@/app/useGrantedScopes';
import {
  campaignCompletions,
  participateState,
  participatingObjectives,
  type CampaignCompletion,
  type ParticipateState,
  type ParticipatingObjective,
} from '@/engine/campaigns/participation';
import { activeTurnInOffers, type TurnInOffer } from '@/engine/market/turnIn';
import type { LpRate } from '@/engine/loyalty/marketLpValue';
import { loadLpRates } from '@/features/loyalty/lpRates';
import { useLpValue } from '@/features/loyalty/lpValue';
import { useKeyedLoad, type AsyncLoad } from '@/lib/useAsyncLoad';
import { DEFAULT_TRADE_HUB, getTradeHub, type TradeHub } from '@/market/hubs';
import { loadMilitaryCampaigns } from '@/sde/loadSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadCampaignState, loadJoinedObjectives, type JoinedObjectivesRead } from './campaignData';

const PARTICIPATION_ENDPOINTS = ['getCharacterMilitaryCampaignObjectives'] as const;

export interface TurnInOfferDetail extends TurnInOffer {
  objectiveTitle: string;
  campaignTitle: string;
  factionId: number | null;
  systemName: string | null;
  lpValueSource: 'yours' | 'market' | null;
}

export interface TurnInOffers {
  byType: ReadonlyMap<number, TurnInOfferDetail>;
  offerFor: (typeId: number) => TurnInOfferDetail | null;
  fetchedAt: Date;
  fromCache: boolean;
}

function lpValueSource(
  offer: TurnInOffer,
  rateFor: ((corporationId: number) => LpRate) | null
): TurnInOfferDetail['lpValueSource'] {
  if (offer.lpCorporationId === null || offer.lpValue === null || !rateFor) return null;
  return rateFor(offer.lpCorporationId).source === 'yours' ? 'yours' : 'market';
}

export async function loadTurnInOffers(hub: TradeHub): Promise<TurnInOffers> {
  const [file, state] = await Promise.all([loadMilitaryCampaigns(), loadCampaignState()]);
  if (state === null) throw new Error('Military Campaign state could not be read');
  const corporations = [
    ...new Set(
      file.objectives.flatMap((o) =>
        o.turnIn && o.lp && state.objectivesById.get(o.id)?.state === 'Active'
          ? [o.lp.corporationId]
          : []
      )
    ),
  ];
  const [rateFor, systems] = await Promise.all([
    corporations.length > 0 ? loadLpRates(corporations, hub) : null,
    loadSolarSystemsById(),
  ]);
  const offers = activeTurnInOffers(
    file.objectives,
    state.objectivesById,
    (corporationId) => rateFor?.(corporationId).rate ?? null
  );
  const objectives = new Map(file.objectives.map((o) => [o.id, o]));
  const campaigns = new Map(file.campaigns.map((c) => [c.id, c]));
  const byType = new Map<number, TurnInOfferDetail>();
  for (const [typeId, offer] of offers) {
    const campaign = campaigns.get(offer.campaignId);
    byType.set(typeId, {
      ...offer,
      objectiveTitle: objectives.get(offer.objectiveId)?.title ?? '',
      campaignTitle: campaign?.title ?? '',
      factionId: campaign?.factionId ?? null,
      systemName: offer.systemId === null ? null : (systems?.get(offer.systemId)?.name ?? null),
      lpValueSource: lpValueSource(offer, rateFor),
    });
  }
  return {
    byType,
    offerFor: (typeId) => byType.get(typeId) ?? null,
    fetchedAt: state.fetchedAt,
    fromCache: state.fromCache,
  };
}

export function useTurnInOffers(hub: TradeHub | null, enabled = true): AsyncLoad<TurnInOffers> {
  const ownLpValue = useLpValue((state) => state.value);
  const loader = useCallback(() => loadTurnInOffers(hub ?? DEFAULT_TRADE_HUB), [hub]);
  return useKeyedLoad(hub === null || !enabled ? null : `${hub.id}:${ownLpValue}`, loader);
}

export function useTurnInOffersByHub(
  hubs: readonly TradeHub[]
): AsyncLoad<ReadonlyMap<TradeHub['id'], TurnInOffers>> {
  const ownLpValue = useLpValue((state) => state.value);
  const ids = hubs.map((hub) => hub.id).join(',');
  const loader = useCallback(async () => {
    const list = ids.split(',').flatMap((id) => getTradeHub(id) ?? []);
    const entries = await Promise.all(
      list.map(async (hub) => [hub.id, await loadTurnInOffers(hub)] as const)
    );
    return new Map(entries);
  }, [ids]);
  return useKeyedLoad(ids === '' ? null : `${ids}:${ownLpValue}`, loader);
}

export interface Participation {
  characterId: number;
  read: JoinedObjectivesRead;
  stateOf: (objectiveId: string) => ParticipateState;
  contributedTo: (objectiveId: string) => number | null;
}

export async function loadParticipation(characterId: number): Promise<Participation> {
  const read = await loadJoinedObjectives(characterId);
  const joined = read.kind === 'ok' ? read.joined : null;
  return {
    characterId,
    read,
    stateOf: (objectiveId) => participateState(objectiveId, joined),
    contributedTo: (objectiveId) => joined?.get(objectiveId)?.contributed ?? null,
  };
}

export function useParticipation(characterId: number | null): AsyncLoad<Participation> {
  const lacks = useCharacterLacksEndpoints(characterId, PARTICIPATION_ENDPOINTS);
  const loader = useCallback(() => loadParticipation(characterId ?? 0), [characterId]);
  return useKeyedLoad(characterId === null ? null : `${characterId}:${lacks}`, loader);
}

export interface MilitaryCampaignsOverview {
  campaigns: CampaignCompletion[];
  participating: ParticipatingObjective[] | null;
  participation: Participation;
  fetchedAt: Date;
  fromCache: boolean;
}

export async function loadMilitaryCampaignsOverview(
  characterId: number
): Promise<MilitaryCampaignsOverview> {
  const [file, state, participation] = await Promise.all([
    loadMilitaryCampaigns(),
    loadCampaignState(),
    loadParticipation(characterId),
  ]);
  if (state === null) throw new Error('Military Campaign state could not be read');
  const joined = participation.read.kind === 'ok' ? participation.read.joined : null;
  return {
    campaigns: campaignCompletions(file.campaigns, state.campaigns),
    participating:
      joined === null
        ? null
        : participatingObjectives(file.objectives, state.objectivesById, joined),
    participation,
    fetchedAt: state.fetchedAt,
    fromCache: state.fromCache,
  };
}
