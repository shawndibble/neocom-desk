import {
  buildAppraisal,
  buildHubComparison,
  computeAppraisalRefine,
  type Appraisal,
  type AppraisalItem,
  type PriceState,
} from '@/engine/market/appraisal';
import { cheapestLpOffer } from '@/engine/market/lpAcquisition';
import {
  matchAppraisalEntries,
  type AppraisalCatalogue,
  type AppraisalUnmatched,
} from '@/engine/market/appraisalMatch';
import {
  parseAppraisalPasteDetailed,
  type AppraisalUnreadableLine,
} from '@/engine/market/appraisalPaste';
import {
  appliedRefiningImplantPct,
  refiningImplantApplies,
} from '@/engine/industry/characterModifiers';
import { SKILL_IDS } from '@/engine/industry/types';
import { loadCharacterModifiers } from '@/features/character/characterModifiers';
import { findLpOfferMatches, toLpOfferInputs } from '@/features/market/appraisalLpAcquisition';
import { COMPARED_HUBS, type TradeHub } from '@/market/hubs';
import { getHubPricesWithStatus, invalidateHubPrices } from '@/market/prices';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import { knownPackagedVolumeOf } from '@/sde/marketTypes';
import { loadMarketTypesById } from '@/sde/marketTypesById';
import { loadMutaplasmids, loadReprocessing, loadTypes } from '@/sde/loadSde';
import { splitAbyssalUnmatched } from '@/engine/market/abyssalValuation';
import type { ReprocessingType } from '@/sde/types';
import { DEFAULT_REFINING_SETUP, type RefiningSetup } from '@/engine/industry/refiningSetup';

export interface AppraisalOutcome {
  appraisal: Appraisal;
  unmatched: AppraisalUnmatched[];
  pasteText?: string;
  textQuantityLines?: AppraisalUnreadableLine[];
  abyssal?: AppraisalUnmatched[];
  implantBonusPct: number;
  refinesOreOrIce: boolean;
  refining?: RefiningSetup;
  accountingLevel: number | null;
  brokerRelationsLevel: number | null;
  pricesUnreachable: boolean;
  pricesStale?: boolean;
}

let cataloguePromise: Promise<AppraisalCatalogue> | null = null;

export function loadAppraisalCatalogue(): Promise<AppraisalCatalogue> {
  cataloguePromise ??= loadMarketTypes()
    .then((types) => {
      const map = new Map<string, { typeId: number; name: string }>();
      for (const type of types) {
        const key = type.name.toLowerCase();
        if (!map.has(key)) map.set(key, { typeId: type.typeId, name: type.name });
      }
      return map as AppraisalCatalogue;
    })
    .catch((error: unknown) => {
      cataloguePromise = null;
      throw error;
    });
  return cataloguePromise;
}

export function clearAppraisalCatalogue(): void {
  cataloguePromise = null;
}

export interface AppraiseOptions {
  force?: boolean;
  refining?: RefiningSetup;
  quantityColumn?: number | null;
  textQuantityAsOne?: boolean;
}

async function loadAbyssalTypeNames(): Promise<Set<string>> {
  const [data, types] = await Promise.all([loadMutaplasmids(), loadTypes()]);
  return new Set(
    data.abyssalTypeIds.flatMap((typeId) => types[String(typeId)]?.name.toLowerCase() ?? [])
  );
}

export async function appraisePaste(
  text: string,
  hub: TradeHub,
  pricePercent: number,
  characterId: number | null = null,
  {
    force = false,
    refining,
    quantityColumn = null,
    textQuantityAsOne = false,
  }: AppraiseOptions = {}
): Promise<AppraisalOutcome> {
  const { entries, unreadable } = parseAppraisalPasteDetailed(text, {
    quantityColumn,
    textQuantityAsOne,
  });
  const [catalogue, typesById] = await Promise.all([
    loadAppraisalCatalogue(),
    loadMarketTypesById(),
  ]);
  const matchResult = matchAppraisalEntries(entries, catalogue);
  const { matched } = matchResult;
  const abyssalNames =
    matchResult.unmatched.length === 0 ? null : await loadAbyssalTypeNames().catch(() => null);
  const split = abyssalNames
    ? splitAbyssalUnmatched(matchResult.unmatched, abyssalNames)
    : { abyssal: [], unmatched: matchResult.unmatched };
  const { abyssal } = split;
  const unmatched = [
    ...split.unmatched,
    ...unreadable.map(({ name, lines }) => ({ name, lines })),
  ].sort((a, b) => a.lines[0] - b.lines[0]);
  const typeIds = matched.map((match) => match.typeId);

  const [reprocessingMap, modifiers, lpMatches] =
    characterId === null
      ? [null, null, null]
      : await Promise.all([
          loadReprocessing().catch(() => null),
          loadCharacterModifiers(characterId, Date.now()),
          findLpOfferMatches(characterId, typeIds),
        ]);

  const reprocessingByTypeId = new Map<number, ReprocessingType>();
  if (reprocessingMap) {
    for (const match of matched) {
      const entry = reprocessingMap[String(match.typeId)];
      if (entry) reprocessingByTypeId.set(match.typeId, entry);
    }
  }

  const materialTypeIds = [
    ...new Set(
      [...reprocessingByTypeId.values()].flatMap((entry) => entry.materials.map((m) => m.typeID))
    ),
  ];
  const allTypeIds = [
    ...new Set([...typeIds, ...materialTypeIds, ...(lpMatches?.requiredItemTypeIds ?? [])]),
  ];
  if (force) invalidateHubPrices(hub.stationId, allTypeIds);
  const {
    prices,
    unreachable: pricesUnreachable,
    stale: pricesStale,
  } = await getHubPricesWithStatus(hub, allTypeIds);
  const sellPrices = new Map(
    [...prices].map(([typeId, agg]) => [typeId, agg.sellMin ?? undefined])
  );

  let implantApplied = false;
  let refinesOreOrIce = false;
  const materialPricesOf = (
    reprocessing: ReprocessingType,
    side: (aggregate: ReturnType<typeof prices.get>) => number | null | undefined
  ): Record<number, number> =>
    Object.fromEntries(
      reprocessing.materials
        .map((m): [number, number | null | undefined] => [m.typeID, side(prices.get(m.typeID))])
        .filter((entry): entry is [number, number] => entry[1] !== undefined && entry[1] !== null)
    );

  const items: AppraisalItem[] = matched.map((match) => {
    const aggregate = prices.get(match.typeId);
    const reprocessing = reprocessingByTypeId.get(match.typeId);
    const refine =
      reprocessing && modifiers
        ? computeAppraisalRefine({
            quantity: match.quantity,
            reprocessing: {
              portionSize: reprocessing.portionSize,
              materials: reprocessing.materials.map((m) => ({
                typeId: m.typeID,
                quantity: m.quantity,
              })),
              specialisationSkillId: reprocessing.specialisationSkillID,
            },
            modifiers,
            refining,
            materialPrices: materialPricesOf(reprocessing, (agg) => agg?.buyMax),
            materialSellPrices: materialPricesOf(reprocessing, (agg) => agg?.sellMin),
          })
        : undefined;
    if (refine && reprocessing && modifiers) {
      if (refiningImplantApplies(reprocessing.specialisationSkillID)) refinesOreOrIce = true;
      if (appliedRefiningImplantPct(modifiers, reprocessing.specialisationSkillID) > 0) {
        implantApplied = true;
      }
    }
    const lpForType = lpMatches?.matchesByTypeId.get(match.typeId);
    const lpOption = lpForType
      ? (cheapestLpOffer(toLpOfferInputs(lpForType, sellPrices), match.quantity) ?? undefined)
      : undefined;
    return {
      typeId: match.typeId,
      name: match.name,
      quantity: match.quantity,
      buy: aggregate?.buyMax ?? null,
      sell: aggregate?.sellMin ?? null,
      unitVolume: knownPackagedVolumeOf(typesById.get(match.typeId)),
      ...(refine ? { refine } : {}),
      ...(lpOption ? { lpOption } : {}),
    };
  });

  return {
    appraisal: buildAppraisal(items, pricePercent),
    unmatched,
    pasteText: text,
    textQuantityLines: unreadable.filter((line) => line.reason === 'text-quantity'),
    abyssal,
    implantBonusPct: implantApplied ? (modifiers?.refiningImplantPct ?? 0) : 0,
    refinesOreOrIce,
    ...(modifiers ? { refining: refining ?? DEFAULT_REFINING_SETUP } : {}),
    accountingLevel: modifiers ? (modifiers.skills[SKILL_IDS.accounting] ?? 0) : null,
    brokerRelationsLevel: modifiers ? (modifiers.skills[SKILL_IDS.brokerRelations] ?? 0) : null,
    pricesUnreachable,
    pricesStale,
  };
}

export interface HubComparisonRow {
  hub: TradeHub;
  buy: number | null;
  sell: number | null;
  unreachable: boolean;
  items?: readonly AppraisalItem[];
  priceState?: PriceState;
}

export async function compareHubs(
  text: string,
  pricePercent: number,
  { force = false, quantityColumn = null, textQuantityAsOne = false }: AppraiseOptions = {}
): Promise<HubComparisonRow[]> {
  const { entries } = parseAppraisalPasteDetailed(text, { quantityColumn, textQuantityAsOne });
  const catalogue = await loadAppraisalCatalogue();
  const { matched } = matchAppraisalEntries(entries, catalogue);
  const typeIds = matched.map((match) => match.typeId);

  return Promise.all(
    COMPARED_HUBS.map(async (hub) => {
      if (force) invalidateHubPrices(hub.stationId, typeIds);
      const { prices, unreachable } = await getHubPricesWithStatus(hub, typeIds);
      const items: AppraisalItem[] = matched.map((match) => {
        const aggregate = prices.get(match.typeId);
        return {
          typeId: match.typeId,
          name: match.name,
          quantity: match.quantity,
          buy: aggregate?.buyMax ?? null,
          sell: aggregate?.sellMin ?? null,
        };
      });
      const { buy, sell } = buildHubComparison(items, pricePercent);
      return { hub, buy, sell, unreachable, items };
    })
  );
}
