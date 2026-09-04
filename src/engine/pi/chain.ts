/**
 * Planetary production chains: expand a planetary commodity into the whole
 * recipe graph beneath it, then cost that chain under a sourcing floor, a
 * planet layout and a customs tax rate.
 *
 * ## Why this recurses when `recipeInputs` deliberately does not
 *
 * CONTEXT.md round 29 fixed `features/industry/recipes.ts` at **one level
 * deep**, and `engine/industry/makeOrBuy.ts` prices a planetary material from
 * its inputs at the hub with no customs tax at all. Both are right for what
 * they answer: a Build Plan material row asks "is making this one material
 * cheaper than buying it", and the honest answer there prices its inputs the
 * way the plan would actually acquire them — off the market, at the hub, with
 * no colony involved.
 *
 * A planetary chain asks a different question: "which tiers should I make, and
 * how should I lay them out across planets?" That question is meaningless one
 * level deep, because the thing being decided — where a tier boundary falls
 * relative to a *planet* boundary — only exists across the full depth. So this
 * module is a deliberate, reasoned departure from round 29 for the planetary
 * case, and a new module beside `makeOrBuy` rather than a change to it:
 * `makeOrBuy` keeps answering the material-row question unchanged, and neither
 * it nor `recipeInputs` is touched.
 *
 * ## Customs tax is charged per PLANET boundary, not per tier boundary
 *
 * This is the crux, and the easiest thing to get wrong. Goods are taxed by a
 * customs office when they leave or enter a **planet**. Two tiers made on the
 * same planet pay nothing between them — the link between two pins on one
 * planet crosses no customs office. So the tax a chain pays is a function of
 * how its tiers are laid out across planets, which is a user decision, not a
 * property of the recipe. Same chain, same prices, a 15% rate: all made tiers
 * on one planet is profitable, one planet per tier is not, and the margin
 * changes sign from the layout alone. `layout` is therefore a parameter, and a
 * boundary is charged only where the layout actually puts one.
 *
 * The rate is a parameter for the same reason — it inverts which sourcing
 * floor wins. Highsec is 10% NPC on a POCO plus whatever the owner adds,
 * reduced 1% per level of Customs Code Expertise; outside highsec a player
 * POCO has no NPC component at all and can be 0, while a vestigial NPC office
 * charges 17% that the skill cannot reduce. At 0% supplying your own P0 wins;
 * at 10% and up buying P1 wins. Nothing here hardcodes a rate, and security
 * status never enters this module: it only ever moves the rate, which the
 * caller supplies. Deriving the rate from the skills the app already reads is
 * the feature layer's job, not this one's.
 *
 * ## Yield is never derived from security status
 *
 * Planets in lower-security systems are richer, but there is no published
 * multiplier and per-planet richness is scanner-only — it is not in ESI. So
 * `extractionRate` is a plain parameter and `null` is a first-class value, not
 * an edge case: a user with no colonies at all is the opening state. Every
 * floor that acquires its inputs off the market stays fully computable without
 * it, so the planner can answer "should I buy P1 and make P2-P4" on day one.
 * Only the P0 floor depends on a planet you may not have, and it returns an
 * explicit `needs-extraction-rate` result rather than a number, a zero or a
 * guess.
 *
 * When a caller does have colonies, it should derive that rate through
 * `engine/pi/extraction.ts` rather than reading `qty_per_cycle` straight off
 * the pin: extractor output decays over a program, so the raw figure overstates
 * a 14-day program by around 150%. Either way the rate arrives here as a
 * number, and this module never computes one.
 *
 * ## Two accounting choices worth stating outright
 *
 * - Sourced material crosses exactly one customs boundary: the import onto the
 *   planet that consumes it. On the P0 floor that means the extraction side is
 *   sized (how many extractors) but not itself taxed — extractors feed a
 *   factory over planet-local links when they share a planet, and an operation
 *   spread across extraction planets pays its own exports outside this chain's
 *   boundary set.
 * - P0 you extract is still valued at `prices`, not at zero. Extracting it
 *   costs a planet slot and forgoes a sale, and pricing it at zero would make
 *   the P0 floor win at every rate — which the tax tables show it does not.
 *
 * Pure: prices, tax rate, layout and extraction rate are all parameters. No
 * fetch, no market imports, no clock, no skill lookups.
 */

import type { PiData, PiSchematic } from '@/sde/types';
import type {
  ChainCostBreakdown,
  ChainCostOptions,
  ChainCostResult,
  ChainLayout,
  ChainNode,
  ExpandChainOptions,
  ExtractionPlan,
  PiChain,
  PiTier,
  SourcedLine,
  SourcingFloor,
} from './types';

export type {
  ChainCostBreakdown,
  ChainCostNeedsExtractionRate,
  ChainCostOptions,
  ChainCostResult,
  ChainInput,
  ChainLayout,
  ChainNode,
  ExpandChainOptions,
  ExtractionLine,
  ExtractionPlan,
  PiChain,
  PiTier,
  SourcedLine,
  SourcingFloor,
} from './types';

/**
 * ISK the customs office values one unit at, by tier. This is *not* the SDE
 * `basePrice` and `basePrice` must not be substituted for it.
 *
 * Verified against the ticket's own margin tables (#304): the five tax bases
 * those tables imply — 1,740,000 / 1,632,000 / 1,584,000 / 1,920,000 for the
 * P3/P2/P1/P0 floors on one planet, and 4,500,000 for the P1 floor per tier,
 * all per Broadcast Node — are linear in exactly these five numbers, and
 * `chain.test.ts` reproduces all five to the ISK. A correction is a one-line
 * edit here.
 */
export const CUSTOMS_TAXABLE_VALUE: Readonly<Record<PiTier, number>> = {
  0: 5,
  1: 400,
  2: 7_200,
  3: 60_000,
  4: 1_200_000,
};

/** Import is charged on half the export taxable value. */
export const IMPORT_TAXABLE_FRACTION = 0.5;

/** The highsec NPC base rate, before any POCO owner tax or Customs Code Expertise. */
export const DEFAULT_CUSTOMS_TAX_RATE = 0.1;

const SECONDS_PER_HOUR = 3_600;

/** Absorbs float drift so 66.666.../40 does not ceil to 3 pins instead of 2. */
const CEIL_EPSILON = 1e-9;

/**
 * The tier a sourcing floor sits at: at or below it is bought, above it is
 * made. Exported because `pinBudget.ts` splits the same chain on the same
 * boundary, and two copies of this could drift apart.
 */
export const SOURCING_FLOOR_TIER: Readonly<Record<SourcingFloor, PiTier>> = {
  P0: 0,
  P1: 1,
  P2: 2,
  P3: 3,
};

/**
 * The one place P0 membership is decided. Everything else asks through here,
 * so a change to how `PiData` represents `raw` is a change to this function
 * and nothing else.
 */
export function isP0(typeId: number, pi: PiData): boolean {
  return pi.raw.some((resource) => resource.typeID === typeId);
}

function schematicFor(typeId: number, pi: PiData): PiSchematic | undefined {
  return pi.schematics[String(typeId)];
}

/**
 * Tier read off the graph — P0 is whatever no schematic makes, and everything
 * else is one above its deepest input. No tier table is hardcoded, so a new
 * schematic tiers itself. Note the graph is not strictly layered: three P4
 * schematics take a P1 input directly, which is why "one above the deepest
 * input" is the rule rather than "one above any input".
 */
export function piTier(typeId: number, pi: PiData, seen: ReadonlySet<number> = new Set()): PiTier {
  if (isP0(typeId, pi)) return 0;
  const schematic = schematicFor(typeId, pi);
  if (!schematic) throw new Error(`${typeId} is neither a P0 resource nor a planetary schematic`);
  if (seen.has(typeId)) throw new Error(`planetary schematic cycle at ${typeId}`);
  const next = new Set(seen).add(typeId);
  const deepest = Math.max(...schematic.inputs.map((input) => piTier(input.typeID, pi, next)));
  const tier = deepest + 1;
  if (tier > 4) throw new Error(`${typeId} resolves to P${tier}, beyond the P4 the game defines`);
  return tier as PiTier;
}

function ceilUnits(value: number): number {
  return Math.ceil(value - CEIL_EPSILON);
}

/**
 * Expand `typeId` into every node beneath it, sized for `unitsPerHour` of the
 * target. Expansion terminates at P0 — there is nothing below it to make, and
 * a P0 node is never given a factory count.
 */
export function expandChain(typeId: number, pi: PiData, opts: ExpandChainOptions): PiChain {
  const { unitsPerHour } = opts;
  if (!Number.isFinite(unitsPerHour) || unitsPerHour <= 0) {
    throw new Error(`expandChain needs a positive target rate, got ${unitsPerHour}`);
  }

  const demand = new Map<number, number>();
  const names = new Map<number, string>();

  const walk = (id: number, perHour: number, ancestors: ReadonlySet<number>): void => {
    demand.set(id, (demand.get(id) ?? 0) + perHour);
    const schematic = schematicFor(id, pi);
    if (!schematic) return;
    if (ancestors.has(id)) throw new Error(`planetary schematic cycle at ${id}`);
    names.set(id, schematic.name);
    const next = new Set(ancestors).add(id);
    for (const input of schematic.inputs) {
      // Input names are carried inline on the schematic because most planetary
      // commodities appear in no blueprint, so types.json has no entry.
      if (!names.has(input.typeID)) names.set(input.typeID, input.name);
      walk(input.typeID, (perHour * input.quantity) / schematic.quantity, next);
    }
  };
  walk(typeId, unitsPerHour, new Set());

  const nodes: ChainNode[] = [...demand].map(([id, perHour]) => {
    const schematic = schematicFor(id, pi);
    const tier = piTier(id, pi);
    if (!schematic) {
      return {
        typeId: id,
        name: names.get(id) ?? String(id),
        tier,
        unitsPerHour: perHour,
        cycleTimeSeconds: null,
        outputPerCycle: null,
        cyclesPerHour: null,
        outputPerHour: null,
        factoryPins: null,
        inputs: [],
      };
    }
    // Throughput comes from the schematic's own cycle, not a per-tier constant:
    // it works out to 40/5/3/1 per hour at P1..P4, which is the check on the
    // derivation rather than the source of it.
    const cyclesPerHour = SECONDS_PER_HOUR / schematic.cycleTime;
    const outputPerHour = schematic.quantity * cyclesPerHour;
    return {
      typeId: id,
      name: schematic.name,
      tier,
      unitsPerHour: perHour,
      cycleTimeSeconds: schematic.cycleTime,
      outputPerCycle: schematic.quantity,
      cyclesPerHour,
      outputPerHour,
      factoryPins: ceilUnits(perHour / outputPerHour),
      inputs: schematic.inputs.map((input) => ({
        typeId: input.typeID,
        quantityPerCycle: input.quantity,
      })),
    };
  });

  nodes.sort((a, b) => b.tier - a.tier || a.typeId - b.typeId);
  return { targetTypeId: typeId, targetPerHour: unitsPerHour, nodes };
}

/**
 * The planet a made node sits on. `single-planet` puts every made tier on one
 * planet, so nothing between them is ever taxed; `planet-per-tier` gives each
 * made tier its own, so every hop pays an export and an import.
 */
function planetOf(tier: PiTier, layout: ChainLayout): string {
  return layout === 'single-planet' ? 'made' : `tier-${tier}`;
}

export function chainCost(chain: PiChain, opts: ChainCostOptions): ChainCostResult {
  const {
    prices,
    sourcingFloor,
    layout,
    taxRate = DEFAULT_CUSTOMS_TAX_RATE,
    extractionRate = null,
  } = opts;

  const byId = new Map(chain.nodes.map((node) => [node.typeId, node]));
  const target = byId.get(chain.targetTypeId);
  if (!target) throw new Error(`chain is missing its own target ${chain.targetTypeId}`);

  const floorTier = SOURCING_FLOOR_TIER[sourcingFloor];
  if (floorTier >= target.tier) {
    throw new Error(
      `sourcing floor ${sourcingFloor} is at or above the target's own tier P${target.tier}; there would be nothing to make`
    );
  }

  // Re-walk the graph against the floor. Demand below the floor is not merely
  // ignored, it is never incurred: buying P1 means the P0 under it is nobody's
  // problem. Stopping the walk at the floor is what makes that true, and it
  // also handles the three P4 schematics that consume a P1 directly — those
  // land in the sourced set at any floor of P1 or above.
  const demand = new Map<number, number>();
  const madeEdges: { parent: ChainNode; child: ChainNode; unitsPerHour: number }[] = [];

  const walk = (node: ChainNode, perHour: number): void => {
    demand.set(node.typeId, (demand.get(node.typeId) ?? 0) + perHour);
    if (node.tier <= floorTier) return;
    const outputPerCycle = node.outputPerCycle;
    if (outputPerCycle == null) return;
    for (const input of node.inputs) {
      const child = byId.get(input.typeId);
      if (!child) throw new Error(`chain is missing input ${input.typeId} of ${node.typeId}`);
      const childPerHour = (perHour * input.quantityPerCycle) / outputPerCycle;
      if (child.tier > floorTier) {
        madeEdges.push({ parent: node, child, unitsPerHour: childPerHour });
      }
      walk(child, childPerHour);
    }
  };
  walk(target, chain.targetPerHour);

  const nodeAt = (id: number): ChainNode => byId.get(id) as ChainNode;
  const sourcedIds = [...demand.keys()].filter((id) => nodeAt(id).tier <= floorTier);

  // The P0 floor is the only one that supplies itself off a planet rather than
  // a market order, so it is the only one an extraction rate gates. Declining
  // here — before any arithmetic — is what keeps a zero from leaking out.
  const usableRate =
    extractionRate != null && Number.isFinite(extractionRate) && extractionRate > 0
      ? extractionRate
      : null;
  if (sourcingFloor === 'P0' && usableRate == null) {
    return {
      status: 'needs-extraction-rate',
      sourcingFloor: 'P0',
      p0PerHour: sourcedIds.map((id) => ({
        typeId: id,
        name: nodeAt(id).name,
        unitsPerHour: demand.get(id) as number,
      })),
    };
  }

  const perTargetUnit = (perHour: number) => perHour / chain.targetPerHour;
  const priceOf = (id: number, label: string): number => {
    const price = prices[id];
    if (price == null || !Number.isFinite(price)) {
      throw new Error(`no price for ${label} (${id}); the chain cannot be costed`);
    }
    return price;
  };

  const sourced: SourcedLine[] = sourcedIds.map((id) => {
    const node = nodeAt(id);
    const unitPrice = priceOf(id, node.name);
    const units = perTargetUnit(demand.get(id) as number);
    return {
      typeId: id,
      name: node.name,
      tier: node.tier,
      units,
      unitPrice,
      cost: units * unitPrice,
    };
  });
  const sourcedCost = sourced.reduce((sum, line) => sum + line.cost, 0);
  const revenue = priceOf(chain.targetTypeId, target.name);

  // Customs, charged strictly per planet boundary:
  //  - every sourced unit is imported onto the planet that consumes it,
  //  - the target is exported off the planet that made it,
  //  - a made-to-made edge is charged only when the layout puts the two on
  //    different planets, which is exactly why co-locating tiers costs nothing.
  let taxBase = 0;
  for (const line of sourced) {
    taxBase += line.units * CUSTOMS_TAXABLE_VALUE[line.tier] * IMPORT_TAXABLE_FRACTION;
  }
  taxBase +=
    perTargetUnit(demand.get(target.typeId) as number) * CUSTOMS_TAXABLE_VALUE[target.tier];
  for (const edge of madeEdges) {
    if (planetOf(edge.parent.tier, layout) === planetOf(edge.child.tier, layout)) continue;
    const units = perTargetUnit(edge.unitsPerHour);
    const value = CUSTOMS_TAXABLE_VALUE[edge.child.tier];
    taxBase += units * value + units * value * IMPORT_TAXABLE_FRACTION;
  }
  const taxCost = taxRate * taxBase;

  const madeTiers = new Set(
    [...demand.keys()].map((id) => nodeAt(id).tier).filter((tier) => tier > floorTier)
  );

  let extraction: ExtractionPlan | null = null;
  if (sourcingFloor === 'P0' && usableRate != null) {
    const byType = sourcedIds.map((id) => {
      const unitsPerHour = demand.get(id) as number;
      return {
        typeId: id,
        name: nodeAt(id).name,
        unitsPerHour,
        extractors: ceilUnits(unitsPerHour / usableRate),
      };
    });
    extraction = {
      ratePerHour: usableRate,
      totalExtractors: byType.reduce((sum, line) => sum + line.extractors, 0),
      byType,
    };
  }

  const totalCost = sourcedCost + taxCost;
  const breakdown: ChainCostBreakdown = {
    status: 'costed',
    sourcingFloor,
    layout,
    taxRate,
    planetCount: layout === 'single-planet' ? 1 : madeTiers.size,
    sourced,
    sourcedCost,
    taxBase,
    taxCost,
    totalCost,
    revenue,
    margin: revenue - totalCost,
    extraction,
  };
  return breakdown;
}
