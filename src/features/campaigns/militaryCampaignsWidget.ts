import { loadGrantedScopes } from '@/app/grantedScopes';
import { db } from '@/db';
import { ESI_REGISTRY } from '@/esi/registry';
import {
  campaignCompletions,
  objectiveEarned,
  type CampaignCompletion,
  type ParticipatingObjective,
} from '@/engine/campaigns/participation';
import { turnInReward } from '@/engine/market/turnIn';
import { loadCharacterAssets } from '@/features/assets/assets';
import { loadTypeNames } from '@/features/character/typeNames';
import { tradeHubIdFor } from '@/features/market/hub';
import { DEFAULT_TRADE_HUB, getTradeHub } from '@/market/hubs';
import { loadMilitaryCampaigns } from '@/sde/loadSde';
import { loadCampaignState } from './campaignData';
import {
  loadMilitaryCampaignsOverview,
  loadTurnInOffers,
  type TurnInOfferDetail,
} from './useTurnIns';

export interface CampaignWidgetCharacter {
  characterId: number;
  name: string;
  status: 'ok' | 'needsPermission' | 'failed';
}

export interface CampaignWidgetRow {
  key: string;
  characterId: number;
  characterName: string;
  objectiveId: string;
  title: string;
  factionId: number | null;
  filled: number;
  joined: { contributed: number; isk: number; lp: number } | null;
  turnIn: {
    typeId: number;
    name: string;
    held: number;
    reward: number;
    offer: TurnInOfferDetail;
  } | null;
}

export interface MilitaryCampaignsWidgetData {
  campaigns: CampaignCompletion[];
  characters: CampaignWidgetCharacter[];
  rows: CampaignWidgetRow[];
  fetchedAt: Date;
  fromCache: boolean;
}

export interface CampaignCharacterReads {
  characterId: number;
  name: string;
  participating: readonly ParticipatingObjective[];
  contributedTo: (objectiveId: string) => number | null;
  held: ReadonlyMap<number, number>;
}

export function campaignWidgetRows(
  characters: readonly CampaignCharacterReads[],
  offers: ReadonlyMap<number, TurnInOfferDetail>,
  typeNames: ReadonlyMap<number, string>,
  factionOf: (campaignId: string) => number | null
): CampaignWidgetRow[] {
  const nameOf = (typeId: number) => typeNames.get(typeId) ?? `#${typeId}`;
  const offerByObjective = new Map([...offers.values()].map((o) => [o.objectiveId, o]));
  return characters.flatMap((character) => {
    const base = { characterId: character.characterId, characterName: character.name };
    const turnInFor = (offer: TurnInOfferDetail, held: number, contributed: number | null) => ({
      typeId: offer.typeId,
      name: nameOf(offer.typeId),
      held,
      reward: held > 0 ? turnInReward(offer, held, contributed ?? 0).total : 0,
      offer,
    });
    const joinedRows = character.participating.map((p): CampaignWidgetRow => {
      const offer = offerByObjective.get(p.objective.id);
      const held = offer ? (character.held.get(offer.typeId) ?? 0) : 0;
      return {
        ...base,
        key: `${character.characterId}:${p.objective.id}`,
        objectiveId: p.objective.id,
        title: p.objective.title,
        factionId: factionOf(p.objective.campaignId),
        filled: p.filled,
        joined: { contributed: p.contributed, ...objectiveEarned(p.objective, p.contributed) },
        turnIn: offer ? turnInFor(offer, held, p.contributed) : null,
      };
    });
    const joinedIds = new Set(joinedRows.map((row) => row.objectiveId));
    const heldRows = [...character.held].flatMap(([typeId, held]): CampaignWidgetRow[] => {
      const offer = offers.get(typeId);
      if (!offer || held <= 0 || joinedIds.has(offer.objectiveId)) return [];
      return [
        {
          ...base,
          key: `${character.characterId}:${offer.objectiveId}`,
          objectiveId: offer.objectiveId,
          title: offer.objectiveTitle,
          factionId: offer.factionId,
          filled: offer.filled,
          joined: null,
          turnIn: turnInFor(offer, held, character.contributedTo(offer.objectiveId)),
        },
      ];
    });
    return [...joinedRows, ...heldRows].sort(
      (a, b) =>
        heldRank(a) - heldRank(b) ||
        (b.turnIn?.reward ?? 0) - (a.turnIn?.reward ?? 0) ||
        a.title.localeCompare(b.title)
    );
  });
}

export function turnInTypeIds(
  characters: readonly CampaignCharacterReads[],
  offers: ReadonlyMap<number, TurnInOfferDetail>
): Set<number> {
  const typeByObjective = new Map([...offers.values()].map((o) => [o.objectiveId, o.typeId]));
  const ids = new Set<number>();
  for (const character of characters) {
    for (const typeId of character.held.keys()) ids.add(typeId);
    for (const p of character.participating) {
      const typeId = typeByObjective.get(p.objective.id);
      if (typeId !== undefined) ids.add(typeId);
    }
  }
  return ids;
}

const heldRank = (row: CampaignWidgetRow) => (row.turnIn && row.turnIn.held > 0 ? 0 : 1);

async function heldTypes(
  characterId: number,
  wanted: ReadonlySet<number>
): Promise<Map<number, number>> {
  const held = new Map<number, number>();
  if (wanted.size === 0) return held;
  const { cached } = await loadCharacterAssets(characterId).catch(() => ({ cached: null }));
  for (const asset of cached?.data ?? []) {
    if (wanted.has(asset.type_id)) {
      held.set(asset.type_id, (held.get(asset.type_id) ?? 0) + asset.quantity);
    }
  }
  return held;
}

const JOINED_SCOPE = ESI_REGISTRY.getCharacterMilitaryCampaignObjectives.scope;

async function unreadState(
  stored: readonly { characterId: number; name: string }[]
): Promise<MilitaryCampaignsWidgetData> {
  const scopes = await Promise.all(stored.map((c) => loadGrantedScopes(c.characterId)));
  if (scopes.some((granted) => granted.has(JOINED_SCOPE))) {
    throw new Error('Military Campaign state could not be read');
  }
  return {
    campaigns: [],
    characters: stored.map((c) => ({
      characterId: c.characterId,
      name: c.name,
      status: 'needsPermission' as const,
    })),
    rows: [],
    fetchedAt: new Date(),
    fromCache: false,
  };
}

export async function loadMilitaryCampaignsWidget(
  characterId: number
): Promise<MilitaryCampaignsWidgetData> {
  const [state, file, stored, hubId] = await Promise.all([
    loadCampaignState(),
    loadMilitaryCampaigns(),
    db.characters.toArray(),
    tradeHubIdFor(characterId).catch(() => DEFAULT_TRADE_HUB.id),
  ]);
  if (state === null) return unreadState(stored);
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const [offers, overviews] = await Promise.all([
    loadTurnInOffers(hub).catch(() => null),
    Promise.all(
      stored.map((character) =>
        loadMilitaryCampaignsOverview(character.characterId).catch(() => null)
      )
    ),
  ]);
  const byType = offers?.byType ?? new Map<number, TurnInOfferDetail>();
  const wanted = new Set(byType.keys());

  const characters: CampaignWidgetCharacter[] = [];
  const reads: CampaignCharacterReads[] = [];
  await Promise.all(
    stored.map(async (character, i) => {
      const overview = overviews[i];
      const kind = overview?.participation.read.kind ?? 'failed';
      characters[i] = {
        characterId: character.characterId,
        name: character.name,
        status: kind === 'ok' ? 'ok' : kind === 'needsPermission' ? 'needsPermission' : 'failed',
      };
      if (!overview || (overview.participating === null && kind !== 'needsPermission')) return;
      reads[i] = {
        characterId: character.characterId,
        name: character.name,
        participating: overview.participating ?? [],
        contributedTo: overview.participation.contributedTo,
        held: await heldTypes(character.characterId, wanted),
      };
    })
  );
  const readable = reads.filter((read): read is CampaignCharacterReads => read !== undefined);
  const typeIds = [...turnInTypeIds(readable, byType)];
  const typeNames = typeIds.length === 0 ? new Map<number, string>() : await loadTypeNames(typeIds);
  const factions = new Map(file.campaigns.map((c) => [c.id, c.factionId]));
  return {
    campaigns: campaignCompletions(file.campaigns, state.campaigns),
    characters,
    rows: campaignWidgetRows(readable, byType, typeNames, (id) => factions.get(id) ?? null),
    fetchedAt: state.fetchedAt,
    fromCache: state.fromCache,
  };
}
