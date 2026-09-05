/**
 * Which tier a planet should stop at — steps 6 and 7 of the pin-budget
 * algorithm (issue #426).
 *
 * Steps 1-5 in `pinBudget.ts` answer "how much of *this* chain fits here" for
 * one chain the caller names. They never chose the chain. So the Advisor could
 * say what a colony is doing and what it has room for, and never "build up to
 * P2 here" — which was half the point of the tab. This module enumerates the
 * candidates, scores each one, and picks.
 *
 * ## The candidate set is what the planet can actually extract
 *
 * A candidate is scored at the **P0 sourcing floor**: everything below the
 * target is pulled out of this planet's own ground. That makes the gate
 * non-negotiable — a P2 needs two distinct P1s, whose P0s are frequently *not*
 * both yielded by the planet type in front of you, and nothing in `planColony`
 * checks it. Sizing one anyway would recommend "build up to P2 here" on a
 * planet that cannot extract half the inputs, which is the exact
 * confidently-wrong answer the Advisor exists to avoid. So
 * `localChainTargets` keeps only products whose whole P0 closure the planet
 * yields.
 *
 * Buying inputs in and making a higher tier from them is a real strategy and a
 * good one — it is simply the Plan tab's question ("what should I make, and
 * where do I source it"), not this one's ("what can *this planet* make out of
 * what *it* can dig up").
 *
 * ## Selling the raw resource is a candidate, not the absence of one
 *
 * `chainCost` refuses a sourcing floor at or above the target's own tier,
 * because there would be nothing to make — so "keep extracting and sell it" can
 * never come back through it. It still has to be on the list: at a 10% customs
 * rate, raw P0 out-earning every made tier is a common and useful answer, and
 * "no tier is profitable" is a much weaker thing to tell a pilot than "sell
 * the ore". Each local P0 is therefore its own tier-0 candidate, fitted as
 * repeats of a single Extractor Control Unit and taxed on its export only.
 *
 * ## Margin an hour is a colony figure, not a unit figure
 *
 * `chainCost` reports margin per unit of the target, and
 * `singleFactoryChain` expands at *one factory's* rate. The colony's own
 * output is therefore `blocks * chain.targetPerHour`, and the score is that
 * times the per-unit margin. Multiplying by `chain.targetPerHour` alone —
 * easy to reach for, since it is right there on the chain — silently reports
 * one factory's earnings for a colony of twelve, and does it without changing
 * which tier wins, so a test that only checks the winner would not notice.
 *
 * ## What this deliberately does not do
 *
 * It does not charge for links. `engine/pi/linkCost.ts` needs the distance
 * between two pins, which only a colony that exists has, so the fit here is
 * against a budget the caller has already made honest — a built colony passes
 * its Command Center's supply less its own measured link load. A caller with
 * no measured link load has no honest budget to pass and must not invent one;
 * see CONTEXT.md round 55.
 *
 * Pure: budget, prices, tax rate, extraction rate, link capacity and buffer
 * policy are all parameters. No fetch, no clock, no payload imports.
 */

import type { PiData, PiInfrastructure } from '@/sde/types';
import { CUSTOMS_TAXABLE_VALUE, chainCost, isP0, piTier } from './chain';
import { checkThroughput, fitColony, planColony, singleFactoryChain } from './pinBudget';
import type {
  ChainLayout,
  ColonyFit,
  FitColonyOptions,
  PiChain,
  PiTier,
  PinLoad,
  ThroughputCheck,
  ThroughputOptions,
} from './types';

export interface StopTierOptions {
  /** P0 typeIDs this planet actually yields. The candidate set is gated on it. */
  localResources: readonly number[];
  /**
   * CPU and Powergrid the fit is against. Already net of anything the caller
   * knows is committed — a built colony's measured link load, above all. This
   * module cannot compute a link cost and must not pretend links are free.
   */
  budget: PinLoad;
  infrastructure: PiInfrastructure;
  overhead: FitColonyOptions['overhead'];
  headsPerExtractor: number;
  /** Sustained units an hour one extractor program yields. See `engine/pi/extraction.ts`. */
  extractionRatePerHour: number;
  /** ISK per unit by typeID. A type the hub does not quote is absent, never zero. */
  prices: Readonly<Record<number, number>>;
  taxRate: number;
  layout: ChainLayout;
  linkCapacityPerHour: ThroughputOptions['linkCapacityPerHour'];
  bufferHours: ThroughputOptions['bufferHours'];
}

interface CandidateBase {
  typeId: number;
  name: string;
  tier: PiTier;
}

export interface ScoredStopTier extends CandidateBase {
  status: 'scored';
  /** Ratio blocks that fit — extractors, on a tier-0 candidate. */
  blocks: number;
  /** Which of the two ceilings stopped the fit there. */
  limitedBy: ColonyFit['limitedBy'];
  /** What the fitted colony makes an hour. */
  unitsPerHour: number;
  marginPerUnit: number;
  marginPerHour: number;
  throughput: ThroughputCheck;
}

export type StopTierEntry =
  | ScoredStopTier
  /** The budget hosts no whole block of this chain, so there is no colony to score. */
  | (CandidateBase & { status: 'does-not-fit'; fit: ColonyFit })
  /** It fits, but cannot move or hold its own output. */
  | (CandidateBase & { status: 'rejected-throughput'; throughput: ThroughputCheck })
  /** The hub quotes no price for one of the types this candidate turns on. */
  | (CandidateBase & { status: 'needs-price'; missing: number[] });

export type StopTierAdvice =
  | { kind: 'recommended'; best: ScoredStopTier; entries: StopTierEntry[] }
  /**
   * Every candidate was enumerated and none came back with a margin above
   * zero — either it lost money, or it could not be fitted, moved or priced.
   * `entries` says which, per candidate; there is no guess in place of a
   * recommendation.
   */
  | { kind: 'no-profitable-tier'; entries: StopTierEntry[] }
  /** The planet yields nothing, so there was never a candidate to score. */
  | { kind: 'nothing-to-score'; entries: [] };

/**
 * Every P0 a product needs, all the way down. Stops at P0 rather than
 * recursing into it, and dedupes, so a chain reaching one resource twice
 * reports it once.
 */
function p0Closure(typeId: number, pi: PiData, seen = new Set<number>()): Set<number> {
  const out = new Set<number>();
  if (isP0(typeId, pi)) {
    out.add(typeId);
    return out;
  }
  const schematic = pi.schematics[String(typeId)];
  if (!schematic || seen.has(typeId)) return out;
  const next = new Set(seen).add(typeId);
  for (const input of schematic.inputs) {
    for (const id of p0Closure(input.typeID, pi, next)) out.add(id);
  }
  return out;
}

/**
 * Products this planet could make entirely from its own ground, in payload
 * order.
 *
 * A product whose chain reaches a P0 the planet does not yield is dropped
 * rather than quietly re-sourced at a higher floor: this module's whole
 * question is what the planet in front of you can do by itself.
 */
export function localChainTargets(localResources: readonly number[], pi: PiData): number[] {
  const local = new Set(localResources);
  if (local.size === 0) return [];
  return Object.keys(pi.schematics)
    .map(Number)
    .filter((typeId) => {
      const needed = p0Closure(typeId, pi);
      return needed.size > 0 && [...needed].every((id) => local.has(id));
    });
}

/**
 * A one-node chain for a resource that is extracted and sold as it comes out.
 * `checkThroughput` measures flow off a chain, and an extraction-only colony
 * has one: the resource itself, at one extractor's rate per block.
 */
function rawChain(typeId: number, name: string, ratePerHour: number): PiChain {
  return {
    targetTypeId: typeId,
    targetPerHour: ratePerHour,
    nodes: [
      {
        typeId,
        name,
        tier: 0,
        unitsPerHour: ratePerHour,
        cycleTimeSeconds: null,
        outputPerCycle: null,
        cyclesPerHour: null,
        outputPerHour: null,
        factoryPins: null,
        inputs: [],
      },
    ],
  };
}

function priceOf(typeId: number, prices: Readonly<Record<number, number>>): number | null {
  const price = prices[typeId];
  return price != null && Number.isFinite(price) ? price : null;
}

/** A tier-0 candidate: repeats of one Extractor Control Unit, sold as extracted. */
function scoreRawResource(
  typeId: number,
  name: string,
  pi: PiData,
  opts: StopTierOptions
): StopTierEntry {
  const base = { typeId, name, tier: 0 as PiTier };
  const fit = fitColony({
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    block: { extractorControlUnit: 1 },
    headsPerExtractor: opts.headsPerExtractor,
  });
  if (fit.blocks <= 0) return { ...base, status: 'does-not-fit', fit };

  const price = priceOf(typeId, opts.prices);
  if (price === null) return { ...base, status: 'needs-price', missing: [typeId] };

  const throughput = checkThroughput(rawChain(typeId, name, opts.extractionRatePerHour), pi, {
    blocks: fit.blocks,
    pins: fit.pins,
    infrastructure: opts.infrastructure,
    sourcingFloor: 'P0',
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });
  if (throughput.verdict === 'buffer-overflow' || throughput.verdict === 'link-capacity') {
    return { ...base, status: 'rejected-throughput', throughput };
  }

  // The only customs boundary an extracted-and-sold resource crosses is its
  // own export; nothing is imported onto the planet to make it.
  const marginPerUnit = price - opts.taxRate * CUSTOMS_TAXABLE_VALUE[0];
  const unitsPerHour = fit.blocks * opts.extractionRatePerHour;
  return {
    ...base,
    status: 'scored',
    blocks: fit.blocks,
    limitedBy: fit.limitedBy,
    unitsPerHour,
    marginPerUnit,
    marginPerHour: unitsPerHour * marginPerUnit,
    throughput,
  };
}

/** A made-tier candidate: steps 1-5 through `planColony`, then step 6's score. */
function scoreProduct(typeId: number, pi: PiData, opts: StopTierOptions): StopTierEntry | null {
  const chain = singleFactoryChain(typeId, pi);
  if (chain === null) return null;
  const base = {
    typeId,
    name: chain.nodes.find((n) => n.typeId === typeId)?.name ?? String(typeId),
  };
  const tier = piTier(typeId, pi);

  const plan = planColony(typeId, pi, {
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    headsPerExtractor: opts.headsPerExtractor,
    sourcingFloor: 'P0',
    extractionRatePerHour: opts.extractionRatePerHour,
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });
  if (plan.status === 'not-a-product' || plan.status === 'needs-extraction-rate') return null;
  if (plan.status === 'does-not-fit') {
    return { ...base, tier, status: 'does-not-fit', fit: plan.fit };
  }

  // Asked before `chainCost`, which throws on the first unpriced type and
  // names only that one. A refusal here keeps the rest of the enumeration
  // alive and reports every type the hub is missing.
  const missing = [typeId, ...plan.chain.nodes.filter((n) => n.tier === 0).map((n) => n.typeId)]
    .filter((id, index, all) => all.indexOf(id) === index)
    .filter((id) => priceOf(id, opts.prices) === null);
  if (missing.length > 0) return { ...base, tier, status: 'needs-price', missing };

  const { throughput } = plan;
  if (throughput.verdict === 'buffer-overflow' || throughput.verdict === 'link-capacity') {
    return { ...base, tier, status: 'rejected-throughput', throughput };
  }

  const cost = chainCost(plan.chain, {
    prices: opts.prices,
    sourcingFloor: 'P0',
    layout: opts.layout,
    taxRate: opts.taxRate,
    extractionRate: opts.extractionRatePerHour,
  });
  // Both refusals were answered above; this is a guard against the engine
  // growing a third, not the mechanism.
  if (cost.status !== 'costed') return { ...base, tier, status: 'needs-price', missing: [typeId] };

  const unitsPerHour = plan.fit.blocks * plan.chain.targetPerHour;
  return {
    ...base,
    tier,
    status: 'scored',
    blocks: plan.fit.blocks,
    limitedBy: plan.fit.limitedBy,
    unitsPerHour,
    marginPerUnit: cost.margin,
    marginPerHour: unitsPerHour * cost.margin,
    throughput,
  };
}

/**
 * How close two margins have to be to count as the same answer: one part in a
 * million, relative.
 *
 * Not decoration. A margin an hour is a float built out of a price, a tax
 * base and a block count, so two candidates that are equal in every way a
 * pilot can see still differ in the last bits. Comparing them exactly would
 * let that noise decide, and it decides the wrong way — toward whichever
 * happened to round up, which on a real tie is as often the deeper, more
 * expensive colony as not. A stated tolerance hands the tie to the rule
 * below instead.
 */
const MARGIN_TIE_EPSILON = 1e-6;

function marginsTied(a: number, b: number): boolean {
  return Math.abs(a - b) <= MARGIN_TIE_EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * Every candidate this planet could stop at, scored, and the best of them.
 *
 * Ties are broken toward the **lower tier**, then the lower typeID. Two
 * layouts earning the same ISK an hour are not equally good — the shallower
 * one needs fewer factories, fewer links and no imported intermediate — and a
 * rule that says so is what keeps the recommendation from flipping between
 * two equal answers as prices wobble.
 */
export function recommendStopTier(opts: StopTierOptions, pi: PiData): StopTierAdvice {
  const local = new Set(opts.localResources);
  const rawEntries = pi.raw
    .filter((resource) => local.has(resource.typeID))
    .map((resource) => scoreRawResource(resource.typeID, resource.name, pi, opts));
  const madeEntries = localChainTargets(opts.localResources, pi)
    .map((typeId) => scoreProduct(typeId, pi, opts))
    .filter((entry): entry is StopTierEntry => entry !== null);

  const entries = [...rawEntries, ...madeEntries];
  if (entries.length === 0) return { kind: 'nothing-to-score', entries: [] };

  const scored = entries
    .filter((entry): entry is ScoredStopTier => entry.status === 'scored')
    .filter((entry) => entry.marginPerHour > 0)
    .sort((a, b) =>
      marginsTied(a.marginPerHour, b.marginPerHour)
        ? a.tier - b.tier || a.typeId - b.typeId
        : b.marginPerHour - a.marginPerHour
    );
  if (scored.length === 0) return { kind: 'no-profitable-tier', entries };
  return { kind: 'recommended', best: scored[0], entries };
}
