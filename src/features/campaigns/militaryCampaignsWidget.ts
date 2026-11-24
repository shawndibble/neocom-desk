/**
 * The Military Campaigns Overview widget's read (issue #6709): every stored
 * Character's Participate answers (`loadMilitaryCampaignsOverview`), the
 * Active turn-in offers, and the turn-in items each Character holds, read
 * from the same cached asset list the Assets page uses (`loadCharacterAssets`).
 *
 * A campaign or objective the baked SDE file does not know yet (one that
 * started after the last bake) is left out by the engines, never a crash; it
 * shows from the next bake.
 *
 * A Turn-in Reward is never a price (scope decision 20261123-164921): the
 * widget's "waiting to turn in" figure stays out of every total but its own.
 */
import { db } from '@/db';
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

/** Where one Character stands on the Military Campaigns Permission. */
export interface CampaignWidgetCharacter {
  characterId: number;
  name: string;
  /** `needsPermission`: no Military Campaigns grant; `failed`: granted, but its read failed with nothing cached. */
  status: 'ok' | 'needsPermission' | 'failed';
}

/** One line of the widget: an objective a Character Participates in, or a turn-in for items it holds. */
export interface CampaignWidgetRow {
  key: string;
  characterId: number;
  characterName: string;
  objectiveId: string;
  /** The objective's own title ("Mine Pyroxeres"). */
  title: string;
  /** The running campaign's faction; null when the SDE named none. */
  factionId: number | null;
  /** Community progress against the target, 0..1. */
  filled: number;
  /** The Character pressed Participate: its contribution and what it has paid. */
  joined: { contributed: number; isk: number; lp: number } | null;
  /** The objective takes an item the Character holds, or one it has joined with an Active offer. */
  turnIn: {
    typeId: number;
    name: string;
    /** Units held across the Character's assets; 0 for a joined objective it holds none for. */
    held: number;
    /** What turning in what it holds pays (ISK plus LP at LP Value), capped as `turnInReward` caps it. */
    reward: number;
    offer: TurnInOfferDetail;
  } | null;
}

export interface MilitaryCampaignsWidgetData {
  /** Every campaign ESI lists that the SDE knows, Active first. */
  campaigns: CampaignCompletion[];
  characters: CampaignWidgetCharacter[];
  rows: CampaignWidgetRow[];
  fetchedAt: Date;
  fromCache: boolean;
}

/** One granted Character's reads, as `campaignWidgetRows` needs them. */
export interface CampaignCharacterReads {
  characterId: number;
  name: string;
  participating: readonly ParticipatingObjective[];
  /** The Character's contribution to an objective it joined, for a turn-in's per-Character cap. */
  contributedTo: (objectiveId: string) => number | null;
  /** Units held by type, only the types an Active offer takes. */
  held: ReadonlyMap<number, number>;
}

/**
 * The widget's rows, pure: each joined objective (any type), and a turn-in row
 * for each held item an Active objective takes. A joined turn-in objective the
 * Character also holds items for is one row, not two. Each Character's rows
 * put those with items to hand in first (by what they pay), then the rest by title.
 */
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

/** Rows with items to hand in come first. */
const heldRank = (row: CampaignWidgetRow) => (row.turnIn && row.turnIn.held > 0 ? 0 : 1);

/** Units held by type, for the types in `wanted` only; none when the assets cannot be read. */
async function heldTypes(
  characterId: number,
  wanted: ReadonlySet<number>
): Promise<Map<number, number>> {
  const held = new Map<number, number>();
  if (wanted.size === 0) return held;
  // A Character without the assets scope, or whose list cannot be read, holds nothing we can see.
  const { cached } = await loadCharacterAssets(characterId).catch(() => ({ cached: null }));
  for (const asset of cached?.data ?? []) {
    if (wanted.has(asset.type_id)) {
      held.set(asset.type_id, (held.get(asset.type_id) ?? 0) + asset.quantity);
    }
  }
  return held;
}

/**
 * Every stored Character's campaign rows. `characterId` is the header
 * Character, whose Market hub the LP is counted at. Throws when the public
 * campaign state cannot be read and nothing is cached, so the widget keeps
 * its last good read and offers Retry.
 */
export async function loadMilitaryCampaignsWidget(
  characterId: number
): Promise<MilitaryCampaignsWidgetData> {
  // The shared state first: every per-Character read below then finds it cached.
  const [state, file, stored, hubId] = await Promise.all([
    loadCampaignState(),
    loadMilitaryCampaigns(),
    db.characters.toArray(),
    tradeHubIdFor(characterId).catch(() => DEFAULT_TRADE_HUB.id),
  ]);
  if (state === null) throw new Error('Military Campaign state could not be read');
  const hub = getTradeHub(hubId) ?? DEFAULT_TRADE_HUB;
  const [offers, overviews] = await Promise.all([
    // No offers (the LP rates failed) is a widget without turn-in rows, not a failed one.
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
      if (!overview || overview.participating === null) return;
      reads[i] = {
        characterId: character.characterId,
        name: character.name,
        participating: overview.participating,
        contributedTo: overview.participation.contributedTo,
        held: await heldTypes(character.characterId, wanted),
      };
    })
  );
  const granted = reads.filter((read): read is CampaignCharacterReads => read !== undefined);
  const heldTypeIds = [...new Set(granted.flatMap((read) => [...read.held.keys()]))];
  const typeNames =
    heldTypeIds.length === 0 ? new Map<number, string>() : await loadTypeNames(heldTypeIds);
  const factions = new Map(file.campaigns.map((c) => [c.id, c.factionId]));
  return {
    campaigns: campaignCompletions(file.campaigns, state.campaigns),
    characters,
    rows: campaignWidgetRows(granted, byType, typeNames, (id) => factions.get(id) ?? null),
    fetchedAt: state.fetchedAt,
    fromCache: state.fromCache,
  };
}
