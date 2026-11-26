import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import type { LpStoreVolume } from '@/features/loyalty/lpStoreVolume';
import {
  nameForType,
  toIndustryBlueprint,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { characterModifiers } from '@/engine/industry/characterModifiers';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { LiquidationBasis } from '@/engine/industry/ownedStockSale';
import type {
  AdjustedPrices,
  BuildResult,
  HubPrices,
  MaterialSourcingMap,
  SkillLevels,
} from '@/engine/industry/types';
import type { ResolvedStandings } from '@/engine/market/standings';
import {
  checkListedPrice,
  type ListedPriceCheck,
  type TradedPrices,
} from '@/engine/market/tradedPriceCheck';
import {
  loyaltyOfferProfit,
  rankByIskPerLp,
  type LoyaltyOfferProfit,
} from '@/engine/loyalty/offerProfit';

export interface RequiredItemLine {
  typeId: number;
  name: string;
  quantity: number;
  unitPrice: number | null;
}

export interface LoyaltyOfferRow {
  offer: LoyaltyStoreOffer;
  itemName: string;
  isBlueprint: boolean;
  productTypeId: number | null;
  productName: string | null;
  build: BuildResult | null;
  profit: LoyaltyOfferProfit;
  sellsPerDay: number | null;
  requiredItems: RequiredItemLine[];
  requiredItemsCost: number | null;
  revenueCheck: ListedPriceCheck | null;
}

export interface LoyaltyOfferComputeInputs {
  offers: readonly LoyaltyStoreOffer[];
  catalog: BlueprintCatalog;
  hubPrices: HubPrices;
  adjustedPrices: AdjustedPrices | null;
  systemCostIndex: number | null;
  regionalTaxPct?: number;
  skills: SkillLevels;
  materialSourcing: MaterialSourcingMap | undefined;
  itemNames?: ReadonlyMap<number, string>;
  revenueHubPrices?: HubPrices;
  liquidationBasis: LiquidationBasis;
  standing?: ResolvedStandings;
  useOwnMaterialsFor?: ReadonlySet<number>;
  playerLp: number | null;
  sellsPerDayByType?: LpStoreVolume | null;
  tradedPrices?: ReadonlyMap<number, TradedPrices> | null;
}

function checkedRevenuePrice(
  inputs: LoyaltyOfferComputeInputs,
  typeId: number
): ListedPriceCheck | null {
  const listed = (inputs.revenueHubPrices ?? inputs.hubPrices)[typeId];
  return listed === undefined ? null : checkListedPrice(listed, inputs.tradedPrices?.get(typeId));
}

function sellsPerDayOf(
  volume: LpStoreVolume | null | undefined,
  typeId: number | null
): number | null {
  if (!volume || typeId === null) return null;
  return volume[typeId] ?? 0;
}

function sumRequiredItemsCost(requiredItems: readonly RequiredItemLine[]): number | null {
  let total = 0;
  for (const item of requiredItems) {
    if (item.unitPrice === null) return null;
    total += item.unitPrice * item.quantity;
  }
  return total;
}

function resolveRequiredItems(
  offer: LoyaltyStoreOffer,
  hubPrices: HubPrices,
  catalog: BlueprintCatalog,
  itemNames: ReadonlyMap<number, string> | undefined
): RequiredItemLine[] {
  return offer.required_items.map((req) => ({
    typeId: req.type_id,
    name: itemNames?.get(req.type_id) ?? nameForType(catalog, req.type_id),
    quantity: req.quantity,
    unitPrice: hubPrices[req.type_id] ?? null,
  }));
}

function computeBlueprintRow(
  offer: LoyaltyStoreOffer,
  catalog: BlueprintCatalog,
  inputs: LoyaltyOfferComputeInputs,
  itemsCost: number | null,
  requiredItems: RequiredItemLine[]
): LoyaltyOfferRow {
  const entry = catalog.byBlueprintTypeID.get(offer.type_id);
  if (!entry) throw new Error(`offer ${offer.offer_id}: not a known blueprint`);

  const useOwnMaterials = inputs.useOwnMaterialsFor?.has(offer.offer_id) ?? false;
  const build = buildVsBuy({
    blueprint: toIndustryBlueprint(entry.blueprint),
    runs: 1,
    me: 0,
    te: 0,
    facility: FACILITY_PRESETS.npcStation,
    rigFit: ['none', 'none', 'none'],
    security: 'highsec',
    systemCostIndex: inputs.systemCostIndex ?? 0,
    regionalTaxPct: inputs.regionalTaxPct,
    adjustedPrices: inputs.adjustedPrices ?? {},
    hubPrices: inputs.hubPrices,
    materialSourcing: useOwnMaterials ? inputs.materialSourcing : undefined,
    modifiers: characterModifiers({ skills: inputs.skills, implantTypeIds: [] }),
    standing: inputs.standing,
  });

  const product = entry.blueprint.products[0];
  const revenueCheck = product ? checkedRevenuePrice(inputs, product.typeID) : null;
  const materialsUnpriceable = build.unpricedMaterials.length > 0;
  const revenue =
    materialsUnpriceable || !product || revenueCheck === null
      ? null
      : product.quantity * revenueCheck.price;

  const profit = loyaltyOfferProfit({
    iskCost: offer.isk_cost,
    lpCost: offer.lp_cost,
    requiredItemsCost: itemsCost,
    revenue,
    buildCost: build.materialCost + build.jobFee.total,
    playerLp: inputs.playerLp,
    liquidationBasis: inputs.liquidationBasis,
    skills: inputs.skills,
    standing: inputs.standing,
  });

  return {
    offer,
    itemName: entry.blueprint.name,
    isBlueprint: true,
    productTypeId: entry.productTypeID,
    productName: entry.productName,
    build,
    profit,
    sellsPerDay: sellsPerDayOf(inputs.sellsPerDayByType, entry.productTypeID),
    requiredItems,
    requiredItemsCost: itemsCost,
    revenueCheck: revenue === null ? null : revenueCheck,
  };
}

function computeItemRow(
  offer: LoyaltyStoreOffer,
  catalog: BlueprintCatalog,
  inputs: LoyaltyOfferComputeInputs,
  itemsCost: number | null,
  requiredItems: RequiredItemLine[]
): LoyaltyOfferRow {
  const revenueCheck = checkedRevenuePrice(inputs, offer.type_id);
  const revenue = revenueCheck === null ? null : revenueCheck.price * offer.quantity;
  const profit = loyaltyOfferProfit({
    iskCost: offer.isk_cost,
    lpCost: offer.lp_cost,
    requiredItemsCost: itemsCost,
    revenue,
    buildCost: 0,
    playerLp: inputs.playerLp,
    liquidationBasis: inputs.liquidationBasis,
    skills: inputs.skills,
    standing: inputs.standing,
  });
  return {
    offer,
    itemName: inputs.itemNames?.get(offer.type_id) ?? nameForType(catalog, offer.type_id),
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit,
    sellsPerDay: sellsPerDayOf(inputs.sellsPerDayByType, offer.type_id),
    requiredItems,
    requiredItemsCost: itemsCost,
    revenueCheck,
  };
}

export function collectNameableTypeIds(offers: readonly LoyaltyStoreOffer[]): number[] {
  const ids = new Set<number>();
  for (const offer of offers) {
    ids.add(offer.type_id);
    for (const req of offer.required_items) ids.add(req.type_id);
  }
  return [...ids];
}

export function offerPriceTypeIds(
  offers: readonly LoyaltyStoreOffer[],
  catalog: BlueprintCatalog
): number[] {
  const ids = new Set<number>();
  for (const offer of offers) {
    ids.add(offer.type_id);
    for (const req of offer.required_items) ids.add(req.type_id);
    const entry = catalog.byBlueprintTypeID.get(offer.type_id);
    if (entry) {
      if (entry.productTypeID !== null) ids.add(entry.productTypeID);
      for (const m of entry.blueprint.materials) ids.add(m.typeID);
    }
  }
  return [...ids];
}

export function computeLoyaltyOfferRows(inputs: LoyaltyOfferComputeInputs): LoyaltyOfferRow[] {
  const rows = inputs.offers.map((offer) => {
    const requiredItems = resolveRequiredItems(
      offer,
      inputs.hubPrices,
      inputs.catalog,
      inputs.itemNames
    );
    const itemsCost = sumRequiredItemsCost(requiredItems);
    return inputs.catalog.byBlueprintTypeID.has(offer.type_id)
      ? computeBlueprintRow(offer, inputs.catalog, inputs, itemsCost, requiredItems)
      : computeItemRow(offer, inputs.catalog, inputs, itemsCost, requiredItems);
  });
  return rankByIskPerLp(rows, (r) => r.profit.iskPerLp);
}
