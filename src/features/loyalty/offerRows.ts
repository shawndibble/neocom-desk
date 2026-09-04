/**
 * Adapts one corp's LP store offers + the manufacturing engine into ranked
 * rows the LP store page renders. An offer counts as a blueprint offer when
 * its `type_id` is a known blueprint in the Build Plan catalog
 * (`src/features/industry/blueprintCatalog.ts`) — LP stores hand out
 * blueprint *copies*, so realizing one still costs a manufacturing job
 * (materials + job fee), not just the store's ISK price. `buildVsBuy` is the
 * same engine call `src/routes/Industry.tsx` makes for a Build Plan, run here
 * at the catalog's default facility (NPC station, no rig, highsec — Industry
 * also starts every new plan there) purely to rank offers consistently; the
 * "Plan in Industry" action hands off to the real thing for a character's
 * actual facility/skills.
 */
import type { LoyaltyStoreOffer } from '@/esi/endpoints';
import {
  nameForType,
  toIndustryBlueprint,
  type BlueprintCatalog,
} from '@/features/industry/blueprintCatalog';
import { buildVsBuy } from '@/engine/industry/buildVsBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type {
  AdjustedPrices,
  BuildResult,
  HubPrices,
  MaterialSourcingMap,
  SkillLevels,
} from '@/engine/industry/types';
import {
  loyaltyOfferProfit,
  rankByIskPerLp,
  type LoyaltyOfferProfit,
} from '@/engine/loyalty/offerProfit';

export interface LoyaltyOfferRow {
  offer: LoyaltyStoreOffer;
  /** The offer's own item name (the blueprint's name, for a blueprint offer). */
  itemName: string;
  isBlueprint: boolean;
  /** The manufactured product's typeID, for a blueprint offer — what "View in Market" / "Plan in Industry" target. */
  productTypeId: number | null;
  productName: string | null;
  /** Manufacturing result at the default facility, for a blueprint offer only. */
  build: BuildResult | null;
  profit: LoyaltyOfferProfit;
}

export interface LoyaltyOfferComputeInputs {
  offers: readonly LoyaltyStoreOffer[];
  catalog: BlueprintCatalog;
  hubPrices: HubPrices;
  adjustedPrices: AdjustedPrices | null;
  systemCostIndex: number | null;
  skills: SkillLevels;
  /** Detected owned-stock coverage, applied only to offers named in `useOwnMaterialsFor`. */
  materialSourcing: MaterialSourcingMap | undefined;
  /**
   * Names for plain-item offers whose `type_id` isn't in `catalog.typesById`
   * — that map only carries types some blueprint or skill references
   * (`src/sde/loadSde.ts`'s trimmed snapshot), while LP stores hand out
   * plenty of items neither ever references (implants, Mindlinks, SKINs).
   * Resolved by the caller via `loadTypeNames` (`src/features/character/typeNames.ts`,
   * the same ESI-backed resolver Assets/Wallet already use), not looked up
   * here — this module stays a pure compute step over data its caller fetched.
   */
  itemNames?: ReadonlyMap<number, string>;
  /**
   * Which blueprint offers (by `offer_id`) should price their build against
   * `materialSourcing` rather than buying every material at the hub — the "use
   * my own materials" toggle is per-offer, not global, since the sourcing map
   * is keyed by material typeID and different offers can share a material.
   */
  useOwnMaterialsFor?: ReadonlySet<number>;
  playerLp: number;
}

/** Sum of `required_items` at hub prices; null when any required item can't be priced. */
function requiredItemsCost(offer: LoyaltyStoreOffer, hubPrices: HubPrices): number | null {
  let total = 0;
  for (const req of offer.required_items) {
    const price = hubPrices[req.type_id];
    if (price === undefined) return null;
    total += price * req.quantity;
  }
  return total;
}

function computeBlueprintRow(
  offer: LoyaltyStoreOffer,
  catalog: BlueprintCatalog,
  inputs: LoyaltyOfferComputeInputs,
  itemsCost: number | null
): LoyaltyOfferRow {
  const entry = catalog.byBlueprintTypeID.get(offer.type_id);
  // Never called without a hit; narrows the map lookup for TypeScript.
  if (!entry) throw new Error(`offer ${offer.offer_id}: not a known blueprint`);

  const useOwnMaterials = inputs.useOwnMaterialsFor?.has(offer.offer_id) ?? false;
  const build = buildVsBuy({
    blueprint: toIndustryBlueprint(entry.blueprint),
    // `offer.quantity` is how many BPCs the offer hands over, not how many
    // runs any one of them is good for — ESI's loyalty offers payload
    // carries no max-run count for the copy, so there is nothing here to
    // read it from. Ranking at 1 run each (rather than guessing) is the
    // honest baseline; "Plan in Industry" is where the character enters the
    // copy's real run count once they've actually got it in hand.
    runs: 1,
    me: 0,
    te: 0,
    facility: FACILITY_PRESETS.npcStation,
    rig: 'none',
    security: 'highsec',
    systemCostIndex: inputs.systemCostIndex ?? 0,
    adjustedPrices: inputs.adjustedPrices ?? {},
    hubPrices: inputs.hubPrices,
    materialSourcing: useOwnMaterials ? inputs.materialSourcing : undefined,
    skills: inputs.skills,
  });

  const profit = loyaltyOfferProfit({
    iskCost: offer.isk_cost,
    lpCost: offer.lp_cost,
    requiredItemsCost: itemsCost,
    // A material with no hub price silently costs 0 in `build.materialCost`
    // (src/engine/industry/sourcing.ts) — `build.unpriceable` is what actually
    // says so, so an unpriceable build must not be read as a priced revenue.
    revenue: build.unpriceable ? null : build.revenue,
    buildCost: build.materialCost + build.jobFee.total,
    playerLp: inputs.playerLp,
  });

  return {
    offer,
    itemName: entry.blueprint.name,
    isBlueprint: true,
    productTypeId: entry.productTypeID,
    productName: entry.productName,
    build,
    profit,
  };
}

function computeItemRow(
  offer: LoyaltyStoreOffer,
  catalog: BlueprintCatalog,
  inputs: LoyaltyOfferComputeInputs,
  itemsCost: number | null
): LoyaltyOfferRow {
  const hubPrice = inputs.hubPrices[offer.type_id];
  const revenue = hubPrice === undefined ? null : hubPrice * offer.quantity;
  const profit = loyaltyOfferProfit({
    iskCost: offer.isk_cost,
    lpCost: offer.lp_cost,
    requiredItemsCost: itemsCost,
    revenue,
    buildCost: 0,
    playerLp: inputs.playerLp,
  });
  return {
    offer,
    itemName: inputs.itemNames?.get(offer.type_id) ?? nameForType(catalog, offer.type_id),
    isBlueprint: false,
    productTypeId: null,
    productName: null,
    build: null,
    profit,
  };
}

/** Ranked most- to least-profitable-per-LP; unpriceable offers sink to the end. */
export function computeLoyaltyOfferRows(inputs: LoyaltyOfferComputeInputs): LoyaltyOfferRow[] {
  const rows = inputs.offers.map((offer) => {
    const itemsCost = requiredItemsCost(offer, inputs.hubPrices);
    return inputs.catalog.byBlueprintTypeID.has(offer.type_id)
      ? computeBlueprintRow(offer, inputs.catalog, inputs, itemsCost)
      : computeItemRow(offer, inputs.catalog, inputs, itemsCost);
  });
  return rankByIskPerLp(rows, (r) => r.profit.iskPerLp);
}
