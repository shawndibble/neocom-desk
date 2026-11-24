/**
 * The campaign turn-ins seam (issue #6703): what every surface asks.
 *
 * - `useTurnInOffers(hub)` / `loadTurnInOffers(hub)`: is there an Active
 *   turn-in for type X, what does it pay per item (ISK, LP, LP as ISK, total),
 *   where (Item Trader, system), how full it is, its LP block and objective.
 *   `turnInReward(offer, quantity)` (`engine/market/turnIn.ts`) prices a pile.
 * - `useParticipation(characterId)` / `loadParticipation(characterId)`: for
 *   Character C and objective O, `participating` / `notParticipating` /
 *   `unknown` (no Military Campaigns Permission, or the read failed).
 * - `loadMilitaryCampaignsOverview(characterId)`: the Overview widget's read —
 *   the Active objectives C Participates in (any type) with its contribution,
 *   and every listed campaign's completion.
 *
 * A Turn-in Reward is never a price: keep it out of Net Worth, Appraisal
 * totals and contract values (scope decision 20261123-164921).
 */
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
import { DEFAULT_TRADE_HUB, type TradeHub } from '@/market/hubs';
import { loadMilitaryCampaigns } from '@/sde/loadSde';
import { loadSolarSystemsById } from '@/sde/solarSystems';
import { loadCampaignState, loadJoinedObjectives, type JoinedObjectivesRead } from './campaignData';

const PARTICIPATION_ENDPOINTS = ['getCharacterMilitaryCampaignObjectives'] as const;

/** One Active turn-in offer with the names a surface shows. */
export interface TurnInOfferDetail extends TurnInOffer {
  objectiveTitle: string;
  campaignTitle: string;
  /** The campaign's faction. */
  factionId: number | null;
  /** The Item Trader's system name; null when the system is unknown. */
  systemName: string | null;
  /** Where `lpValue` came from: the pilot's own LP Value, the store's market one, or none. */
  lpValueSource: 'yours' | 'market' | null;
}

export interface TurnInOffers {
  /** Active offers keyed by the type turned in. */
  byType: ReadonlyMap<number, TurnInOfferDetail>;
  offerFor: (typeId: number) => TurnInOfferDetail | null;
  /** When ESI's objective state was read, and whether it came from the cache. */
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

/**
 * The Active turn-in offers, LP counted at each paying corporation's LP Value
 * at `hub` (the pilot's own LP Value when set). Throws when the live state
 * cannot be read and nothing is cached: no offers is not "no campaign".
 */
export async function loadTurnInOffers(hub: TradeHub): Promise<TurnInOffers> {
  const [file, state] = await Promise.all([loadMilitaryCampaigns(), loadCampaignState()]);
  if (state === null) throw new Error('Military Campaign state could not be read');
  // Which corporations need an LP Value: every one paying LP on an Active turn-in,
  // not only the winners per item, since LP can change which objective wins.
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

/**
 * `loadTurnInOffers` for a component; reloads when the hub or the pilot's LP
 * Value changes. Idle (no campaign request) for a `null` hub (not settled
 * yet, or no turn-ins wanted) or while `enabled` is false, e.g. while the
 * surface has nothing to look up.
 */
export function useTurnInOffers(hub: TradeHub | null, enabled = true): AsyncLoad<TurnInOffers> {
  const ownLpValue = useLpValue((state) => state.value);
  // Never called for no hub: the null key below keeps the load idle.
  const loader = useCallback(() => loadTurnInOffers(hub ?? DEFAULT_TRADE_HUB), [hub]);
  return useKeyedLoad(hub === null || !enabled ? null : `${hub.id}:${ownLpValue}`, loader);
}

/** One Character's Participate answers. */
export interface Participation {
  characterId: number;
  read: JoinedObjectivesRead;
  /** `unknown` unless the read succeeded. */
  stateOf: (objectiveId: string) => ParticipateState;
  /** The Character's own contribution to an objective (for `turnInReward`'s cap); null when unread or not joined. */
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

/**
 * `loadParticipation` for a component; idle for no Character (the surface
 * then shows "Pays only if you've pressed Participate"). Reloads when the
 * Character's grant gains or loses the Military Campaigns Permission.
 */
export function useParticipation(characterId: number | null): AsyncLoad<Participation> {
  const lacks = useCharacterLacksEndpoints(characterId, PARTICIPATION_ENDPOINTS);
  const loader = useCallback(
    // Never called for no Character: the null key below keeps the load idle.
    () => loadParticipation(characterId ?? 0),
    [characterId]
  );
  return useKeyedLoad(characterId === null ? null : `${characterId}:${lacks}`, loader);
}

/** The Military Campaigns widget's read for one Character. */
export interface MilitaryCampaignsOverview {
  /** Every campaign ESI lists, Active first. */
  campaigns: CampaignCompletion[];
  /** Active objectives the Character Participates in; null when its read is missing (see `participation.read`). */
  participating: ParticipatingObjective[] | null;
  participation: Participation;
  fetchedAt: Date;
  fromCache: boolean;
}

/** Throws when the public state cannot be read and nothing is cached. */
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
