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
  loyaltyOfferProfit,
  rankByIskPerLp,
  type LoyaltyOfferProfit,
} from '@/engine/loyalty/offerProfit';

/** One `required_items` turn-in, named and priced for display. */
export interface RequiredItemLine {
  typeId: number;
  name: string;
  quantity: number;
  /** Unit hub price; null when this item has no listed sell price. */
  unitPrice: number | null;
}

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
  /**
   * `offer.required_items`, named/quantified/priced for display. Empty when
   * the offer has none. The same array `requiredItemsCost` below was summed
   * from, so the detail view's line items and its total can never drift from
   * each other or from what `profit.profit` actually subtracted.
   */
  requiredItems: RequiredItemLine[];
  /**
   * Sum of `requiredItems`' hub cost — the exact figure `profit.profit`
   * already subtracts (see `loyaltyOfferProfit`'s `requiredItemsCost` input).
   * `0` for an offer with no required items, `null` when any required item
   * has no hub price (mirrors `profit.profit`'s own null in that case).
   */
  requiredItemsCost: number | null;
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
   * Prices what an offer *nets* — a plain item, or a blueprint's built
   * product — separately from `hubPrices`, which always prices what you
   * *pay* (materials, `required_items` turn-ins). Defaults to `hubPrices`
   * when omitted, i.e. today's single-price-basis behavior. The LP store's
   * buy/sell toggle (`src/features/loyalty/priceBasis.ts`) is the only
   * caller that ever passes something different here — "sell" (list an
   * order) uses the same map as `hubPrices`, "buy" (instant-sell to buy
   * orders) passes the hub's buy-side prices instead.
   */
  revenueHubPrices?: HubPrices;
  /**
   * Which side of the order book `revenueHubPrices` was priced on, as the
   * loyalty engine's market fees need it: `order` (the "Sell (list order)"
   * basis) pays sales tax plus a broker fee, `instant` (the "Buy (instant)"
   * basis) pays sales tax only. The price map alone can't say which — the
   * caller (`priceBasis.ts`) owns that choice, so it states it here rather
   * than having this module infer it.
   */
  liquidationBasis: LiquidationBasis;
  /**
   * The character's standing toward the configured Trade Hub's NPC owner
   * (issue #1238). LP store offers carry no issuing-corp home station in this
   * app's data, so every offer here prices against the same configured hub
   * `hubPrices`/`revenueHubPrices` already use, rather than the corp's own
   * station. Absent/0 = standings assumed 0.
   */
  standing?: ResolvedStandings;
  /**
   * Which blueprint offers (by `offer_id`) should price their build against
   * `materialSourcing` rather than buying every material at the hub — the "use
   * my own materials" toggle is per-offer, not global, since the sourcing map
   * is keyed by material typeID and different offers can share a material.
   */
  useOwnMaterialsFor?: ReadonlySet<number>;
  playerLp: number;
}

/**
 * Sum of `requiredItems`' hub cost; null when any line is unpriced. Sums the
 * same `RequiredItemLine[]` the detail view lists — not a second traversal of
 * `offer.required_items` — so the total can never disagree with the lines it
 * is the total of.
 */
function sumRequiredItemsCost(requiredItems: readonly RequiredItemLine[]): number | null {
  let total = 0;
  for (const item of requiredItems) {
    if (item.unitPrice === null) return null;
    total += item.unitPrice * item.quantity;
  }
  return total;
}

/**
 * Names, quantifies and prices each `required_items` turn-in for display.
 * Named from `itemNames` first — `catalog.typesById` (the `nameForType`
 * fallback) only carries types some blueprint or skill references, which the
 * insignia and faction tags LP stores demand as turn-ins are not — then
 * `nameForType`'s own `#typeId` fallback for anything neither resolved.
 */
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
    rigFit: ['none', 'none', 'none'],
    security: 'highsec',
    systemCostIndex: inputs.systemCostIndex ?? 0,
    adjustedPrices: inputs.adjustedPrices ?? {},
    hubPrices: inputs.hubPrices,
    materialSourcing: useOwnMaterials ? inputs.materialSourcing : undefined,
    // Cost side only (see `profit` below) at 1 run: `build.seconds` is never
    // read here, so the only bonuses that matter are skill-driven and no
    // implant snapshot is loaded for the LP store.
    modifiers: characterModifiers({ skills: inputs.skills, implantTypeIds: [] }),
    standing: inputs.standing,
  });

  // Priced separately from `build.revenue` (which is always `hubPrices`,
  // the sell/pay-side map `buildVsBuy` uses for materials too) so the buy/sell
  // toggle can price the built product on its own basis without touching
  // material sourcing. `entry.blueprint.products[0]` is the same product
  // `buildVsBuy` read to compute `build.revenue` — see toIndustryBlueprint.
  const revenuePrices = inputs.revenueHubPrices ?? inputs.hubPrices;
  const product = entry.blueprint.products[0];
  const productPrice = product ? revenuePrices[product.typeID] : undefined;
  // A material with no hub price silently costs 0 in `build.materialCost`
  // (src/engine/industry/sourcing.ts) — `build.unpricedMaterials` is what
  // actually says so, so an unpriced-materials build must not be read as a
  // priced revenue either, regardless of whether the product itself priced.
  const materialsUnpriceable = build.unpricedMaterials.length > 0;
  const revenue =
    materialsUnpriceable || !product || productPrice === undefined
      ? null
      : product.quantity * productPrice; // 1 run, same as `runs: 1` above

  const profit = loyaltyOfferProfit({
    iskCost: offer.isk_cost,
    lpCost: offer.lp_cost,
    requiredItemsCost: itemsCost,
    revenue,
    // Cost side only. `buildVsBuy` nets its own sales tax and broker fee
    // into `build.profit`, which this deliberately never reads — the fees on
    // an LP offer are charged once, by `loyaltyOfferProfit`, on the revenue
    // priced above.
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
    requiredItems,
    requiredItemsCost: itemsCost,
  };
}

function computeItemRow(
  offer: LoyaltyStoreOffer,
  catalog: BlueprintCatalog,
  inputs: LoyaltyOfferComputeInputs,
  itemsCost: number | null,
  requiredItems: RequiredItemLine[]
): LoyaltyOfferRow {
  const revenuePrice = (inputs.revenueHubPrices ?? inputs.hubPrices)[offer.type_id];
  const revenue = revenuePrice === undefined ? null : revenuePrice * offer.quantity;
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
    requiredItems,
    requiredItemsCost: itemsCost,
  };
}

/**
 * Every type id worth resolving a display name for: an offer's own item plus
 * every `required_items` turn-in. Required-item ids matter here because the
 * fallback catalogue (`nameForType`'s `catalog.typesById`) only carries types
 * some blueprint or skill references — the insignia and faction tags LP
 * stores demand as turn-ins are not — so a caller that only asks
 * `loadTypeNames` about offers' own `type_id`s renders every required item as
 * a raw `#typeId`. Exported so the id set fed to name resolution (the hook)
 * and the id set fed to price resolution (already widened) can be widened the
 * same way.
 */
export function collectNameableTypeIds(offers: readonly LoyaltyStoreOffer[]): number[] {
  const ids = new Set<number>();
  for (const offer of offers) {
    ids.add(offer.type_id);
    for (const req of offer.required_items) ids.add(req.type_id);
  }
  return [...ids];
}

/** Ranked most- to least-profitable-per-LP; unpriceable offers sink to the end. */
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
