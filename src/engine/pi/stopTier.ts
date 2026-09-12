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
 * see CONTEXT.md round 56.
 *
 * ## Extra extractors do not yield the measured mean rate (issue #957)
 *
 * `extractionRatePerHour` is one number: the colony's own measured mean rate
 * for one extractor program. Both scorers used to multiply it straight
 * through by `blocks` — every extractor a layout fits, credited at that same
 * mean. In game, extra Extractor Control Units and extra heads land on
 * poorer ground than the ones already placed, so a real colony's Nth
 * extractor does not match its first.
 *
 * That silently favoured "sell it raw": it is the one candidate that spends
 * its whole budget on extractors, so it fits the most of them, and crediting
 * every one at the mean overstated it more than any made tier, on top of the
 * genuine economics that already make P0 -> P1 close at a 10% customs rate.
 *
 * `extraExtractorYieldFactor` is the fix, and `extractionFalloffRatio` below
 * is where it is spent — once, so both kinds of candidate apply it the same
 * way. Given `n` extractors of one resource, that resource's extraction is
 * credited with `rate * (1 + (n - 1) * factor)` instead of `rate * n`: the
 * first extractor stands at the full mean, every one after it counts for
 * `factor` of it.
 *
 * `scoreRawResource`'s `n` is just `fit.blocks` — its one-resource block is
 * built as a literal single ECU (`recommendStopTier`'s `rawFit`), so one
 * block is one extractor. `scoreProduct` cannot reuse `blocks` the same way:
 * `pinBudget.ts`'s `chainBlockPins` ceils each P0 input **independently**
 * against the extraction rate (`Math.ceil(demand / rate)`, "two resources
 * cannot share one extractor"), so whenever a chain's own per-factory demand
 * for one P0 outruns the rate, that resource gets more than one ECU per
 * block — `n` is `blocks * that ceiling`, not `blocks` alone. Reusing
 * `blocks` as if it were always the true extractor count would under-charge
 * a made candidate whose blocks each carry several ECUs of the same
 * resource, which is the same species of bias this ticket exists to remove,
 * just smaller and on the other side. So `scoreProduct` reproduces that
 * per-P0 ceiling itself (`extractorsPerBlock`, mirroring `chainBlockPins`'s
 * own formula — `pinBudget.ts` cannot be asked to export it without touching
 * a file this fix does not own) and takes the *smallest* resulting ratio
 * across its P0 inputs: the scarcest input's extractor count is what
 * actually bottlenecks the chain's real output, the same reasoning
 * `chainBlockPins` already applies by ceiling per type rather than pooling
 * demand.
 *
 * Applying the same formula at each candidate's own true extractor count is
 * deliberate and load-bearing: if only the raw candidate paid this, or made
 * candidates paid it in name only, the fix would trade one structural tilt
 * for the opposite one, and the raw-vs-made tie-break would move by more
 * than the part this ticket is about.
 *
 * There is no published formula tying scan richness to `qty_per_cycle` —
 * `docs/research/pi-cpu-power-mechanics.md`, "Open questions" — so this is
 * deliberately *not* a decay curve fitted to anything. It is a flat
 * multiplier, honestly labelled as a guess: seeing `DEFAULT_EXTRA_EXTRACTOR_
 * YIELD_FACTOR` used be enough to know a real number was never measured. A
 * fabricated curve would assert precision nobody has; a flat, named
 * placeholder does not.
 *
 * Pure: budget, prices, tax rate, extraction rate, link capacity and buffer
 * policy are all parameters. No fetch, no clock, no payload imports.
 */

import type { PiData, PiInfrastructure } from '@/sde/types';
import { CUSTOMS_TAXABLE_VALUE, chainCost, isP0 } from './chain';
import { checkThroughput, fitColony, planColony } from './pinBudget';
import type {
  ChainLayout,
  ColonyFit,
  PinCounts,
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
  /**
   * What the hub actually pays, by typeId — its highest buy. Defaults to
   * `prices`, which credits every sale at your own ask.
   *
   * This is the option that decides whether "keep selling it raw" is honest.
   * Extracted ore is the widest spread on the board and the biggest volume a
   * colony moves, so pricing it at the ask overstates the one candidate that
   * competes with every made tier.
   */
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
  linkCapacityPerHour: ThroughputOptions['linkCapacityPerHour'];
  bufferHours: ThroughputOptions['bufferHours'];
  /**
   * What one link costs on this colony, charged per pin of every layout fitted
   * here — see `FitColonyOptions`. Omitted means unpriced, which is the only
   * honest answer for a planet with no colony on it to measure one from.
   */
  newLinkCost?: PinLoad;
  /**
   * Fraction of `extractionRatePerHour` each extractor *beyond the first* of
   * a given resource is credited with, in both scorers alike. Omitted means
   * `DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR` — see that constant and the module
   * header's "Extra extractors do not yield the measured mean rate" section.
   * A caller with a better-measured number overrides it here; nothing in
   * this module invents one on its own.
   */
  extraExtractorYieldFactor?: number;
}

/**
 * `extraExtractorYieldFactor`'s own fallback.
 *
 * UNLIKE EVERY OTHER PI NUMBER THIS ENGINE TOUCHES THIS ONE IS NOT DERIVED
 * FROM ANY SOURCE AT ALL. `EXTRACTOR_HEADS_MAX` in `pinBudget.ts` is at least
 * a secondary-source figure someone read off a wiki page; this one has no
 * source to read, because no published formula ties scan richness to
 * `qty_per_cycle` (`docs/research/pi-cpu-power-mechanics.md`, "Open
 * questions"). What is certain is only the direction: a layout's second and
 * later extractors of one resource land on worse ground than its first, so
 * crediting all of them at the colony's own measured mean overstates the
 * layout, and overstates it more the more of them it fits.
 *
 * This number is therefore a flat, hand-maintained, conservative placeholder
 * — not a measured constant, and not a decay curve. It exists to stop "sell
 * it raw" from being overstated *by construction* (issue #957), not to model
 * the real in-game falloff, which nobody has published. Conservative here
 * means erring toward under-correcting: a number close to 1 changes today's
 * recommendation less than a smaller one would, and this module would rather
 * under-fix a real bias than assert a fabricated curve's precision. A caller
 * with a measured number should pass `extraExtractorYieldFactor` and skip
 * this default entirely; it is not a hard limit the way `EXTRACTOR_HEADS_MAX`
 * is, only this module's own fallback when the caller supplies nothing.
 */
export const DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR = 0.8;

/**
 * Every made tier sits on the planet being scored, so nothing between them is
 * taxed. Not a parameter: `planet-per-tier` would charge customs on hops this
 * module has just fitted onto one planet, so the other value is not an
 * alternative here, it is a wrong answer.
 */
const LAYOUT: ChainLayout = 'single-planet';

interface CandidateBase {
  typeId: number;
  name: string;
  tier: PiTier;
}

export interface ScoredStopTier extends CandidateBase {
  status: 'scored';
  /** Ratio blocks that fit — extractors, on a tier-0 candidate. */
  blocks: number;
  /**
   * The pins the fitted layout is built from, overhead included — the fit's
   * own flattened counts.
   *
   * Carried because `blocks` is a ratio count and not something a pilot can go
   * and place: a recommendation reads "2x Extractor Control Unit -> 8x Basic
   * Industry Facility", which needs the counts rather than the ratio they came
   * from. The rest of the `ColonyFit` is still dropped — `used` and `budget`
   * belong to a meter this candidate is not rendered with.
   */
  pins: PinCounts;
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

/**
 * Why no candidate could be recommended — named, because "nothing here pays"
 * and "the hub quotes none of this" send a pilot to different places, and only
 * one of them is about the planet. Reported rather than left for a caller to
 * infer from `entries`, which is how a card ends up asserting a cause the
 * enumeration never reached.
 */
export type StopTierBlocker =
  /** Not one candidate fits the budget, so the Command Center is the constraint. */
  | 'does-not-fit'
  /** Everything that fits is unquoted at the hub. */
  | 'needs-prices'
  /** Everything that fits would overflow its buffer or saturate its links. */
  | 'throughput'
  /** Everything that fits and is priced earns nothing above its own customs tax. */
  | 'unprofitable'
  /** Different candidates are stopped by different things; no single cause is true. */
  | 'mixed';

export type StopTierAdvice =
  | { kind: 'recommended'; best: ScoredStopTier; entries: StopTierEntry[] }
  /**
   * Every candidate was enumerated and none came back with a margin above
   * zero. `blocker` says what stopped them where one thing did, and `entries`
   * says which, per candidate; there is no guess in place of a recommendation.
   */
  | { kind: 'no-recommendation'; blocker: StopTierBlocker; entries: StopTierEntry[] }
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

/**
 * What fraction of a naive `n * rate` figure this module credits a resource's
 * extraction with, once every extractor after the first counts for only
 * `factor` of the mean rate: `(1 + (n - 1) * factor) / n`.
 *
 * Called at each candidate's own true per-resource extractor count `n`, so
 * two candidates with the same real extractor count always pay the same
 * ratio regardless of which kind of candidate they are — see the module
 * header. `n` is always at least 1 here: callers only reach this after a
 * does-not-fit fit, or a zero-block resource ceiling, has already returned.
 */
function extractionFalloffRatio(n: number, factor: number): number {
  return (1 + (n - 1) * factor) / n;
}

/**
 * How many ECUs one ratio block needs for a single P0 input, at this
 * extraction rate — the same ceiling `chainBlockPins` in `pinBudget.ts`
 * applies per P0 type ("two resources cannot share one extractor"),
 * reproduced here because that function hands back only the aggregate
 * `PinCounts` for the whole block, not this per-resource count, and the
 * falloff has to key on the per-resource figure — see the module header.
 *
 * `CEILING_EPSILON` mirrors `pinBudget.ts`'s own `FLOOR_EPSILON`: both exist
 * only to keep float drift (3.0000000001, say) from ceiling up to 4 when the
 * true answer is 3.
 */
const CEILING_EPSILON = 1e-9;

function extractorsPerBlock(demandPerHour: number, ratePerHour: number): number {
  return Math.ceil(demandPerHour / ratePerHour - CEILING_EPSILON);
}

/**
 * The falloff ratio a made-tier candidate actually pays: the smallest of its
 * own P0 inputs' ratios, each computed at that input's true extractor count
 * (`blocks * extractorsPerBlock(...)` for that one resource). The scarcest
 * input is what bottlenecks the chain's real output, so the candidate's
 * output is scaled by that input's own ratio, not by `blocks` treated as if
 * it were always one extractor per resource.
 *
 * A chain reaching this point always has at least one P0 node — `scoreProduct`
 * only calls this after `planColony` has already sized extraction against
 * `sourcingFloor: 'P0'` — so `Math.min` is never asked to reduce an empty list.
 */
function madeTierFalloffRatio(
  chain: PiChain,
  blocks: number,
  ratePerHour: number,
  factor: number
): number {
  const ratios = chain.nodes
    .filter((node) => node.tier === 0)
    .map((node) =>
      extractionFalloffRatio(blocks * extractorsPerBlock(node.unitsPerHour, ratePerHour), factor)
    );
  return Math.min(...ratios);
}

/**
 * The last two steps both kinds of candidate share: reject the layout if it
 * cannot move or hold its own output, otherwise score it.
 *
 * `link-capacity-unknown` is deliberately not a rejection. Link capacity is
 * never guessed — an unsupplied one is an explicit verdict rather than a
 * failure — so treating its absence as one would reject every candidate on
 * every colony.
 */
function rejectOrScore(
  base: CandidateBase,
  fit: ColonyFit,
  throughput: ThroughputCheck,
  unitsPerHour: number,
  marginPerUnit: number
): StopTierEntry {
  if (throughput.verdict === 'buffer-overflow' || throughput.verdict === 'link-capacity') {
    return { ...base, status: 'rejected-throughput', throughput };
  }
  return {
    ...base,
    status: 'scored',
    blocks: fit.blocks,
    pins: fit.pins,
    limitedBy: fit.limitedBy,
    unitsPerHour,
    marginPerUnit,
    marginPerHour: unitsPerHour * marginPerUnit,
    throughput,
  };
}

/**
 * A tier-0 candidate: repeats of one Extractor Control Unit, sold as extracted.
 *
 * `fit` is passed in because it is the same for every resource on the planet —
 * one ECU costs what one ECU costs — so it is solved once for the whole set
 * rather than re-solved per resource.
 */
function scoreRawResource(
  typeId: number,
  name: string,
  fit: ColonyFit,
  pi: PiData,
  opts: StopTierOptions
): StopTierEntry {
  const base = { typeId, name, tier: 0 as PiTier };
  if (fit.blocks <= 0) return { ...base, status: 'does-not-fit', fit };

  const price = priceOf(typeId, opts.revenuePrices ?? opts.prices);
  if (price === null) return { ...base, status: 'needs-price', missing: [typeId] };

  const throughput = checkThroughput(rawChain(typeId, name, opts.extractionRatePerHour), pi, {
    blocks: fit.blocks,
    pins: fit.pins,
    infrastructure: opts.infrastructure,
    sourcingFloor: 'P0',
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });

  // Its export is the only customs boundary extracted-and-sold ore crosses.
  // A made chain's P0 is billed differently, and CONTEXT.md round 56 records
  // why that asymmetry is inherited rather than fixed here.
  const marginPerUnit = price - opts.taxRate * CUSTOMS_TAXABLE_VALUE[0];
  const factor = opts.extraExtractorYieldFactor ?? DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR;
  const unitsPerHour =
    fit.blocks * opts.extractionRatePerHour * extractionFalloffRatio(fit.blocks, factor);
  return rejectOrScore(base, fit, throughput, unitsPerHour, marginPerUnit);
}

/** A made-tier candidate: steps 1-5 through `planColony`, then step 6's score. */
function scoreProduct(typeId: number, pi: PiData, opts: StopTierOptions): StopTierEntry | null {
  // `planColony` expands the chain itself, so its `chain` is where the name and
  // tier are read from. Calling `singleFactoryChain` and `piTier` first to get
  // them walked the same graph twice more, per candidate, per card.
  const plan = planColony(typeId, pi, {
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    headsPerExtractor: opts.headsPerExtractor,
    ...(opts.newLinkCost ? { newLinkCost: opts.newLinkCost } : {}),
    sourcingFloor: 'P0',
    extractionRatePerHour: opts.extractionRatePerHour,
    linkCapacityPerHour: opts.linkCapacityPerHour,
    bufferHours: opts.bufferHours,
  });
  if (plan.status === 'not-a-product' || plan.status === 'needs-extraction-rate') return null;
  const node = plan.chain.nodes.find((entry) => entry.typeId === typeId);
  const base = { typeId, name: node?.name ?? String(typeId), tier: node?.tier ?? (1 as PiTier) };
  if (plan.status === 'does-not-fit') return { ...base, status: 'does-not-fit', fit: plan.fit };

  // Asked before `chainCost`, which throws on the first unpriced type and
  // names only that one. A refusal here keeps the rest of the enumeration
  // alive and reports every type the hub is missing.
  const missing = [typeId, ...plan.chain.nodes.filter((n) => n.tier === 0).map((n) => n.typeId)]
    .filter((id, index, all) => all.indexOf(id) === index)
    .filter((id) => priceOf(id, opts.prices) === null);
  if (missing.length > 0) return { ...base, status: 'needs-price', missing };

  const cost = chainCost(plan.chain, {
    ...(opts.revenuePrices ? { revenuePrices: opts.revenuePrices } : {}),
    // The P0 under a made chain is dug up here, not bought. Charging it at the
    // ask prices material this pilot never buys, and makes every made tier
    // look worse than the ore it came from.
    sourcedBasis: 'own' as const,
    prices: opts.prices,
    sourcingFloor: 'P0',
    layout: LAYOUT,
    taxRate: opts.taxRate,
    extractionRate: opts.extractionRatePerHour,
  });
  // Both refusals were answered above; this is a guard against the engine
  // growing a third, not the mechanism.
  if (cost.status !== 'costed') return { ...base, status: 'needs-price', missing: [typeId] };

  // `blocks * targetPerHour`: the chain was expanded at ONE factory's rate.
  // That assumes every extractor feeding it hits the colony's own measured
  // mean, which `scoreRawResource` no longer assumes for its own candidate —
  // see the module header. `madeTierFalloffRatio` applies the identical
  // falloff here, at this candidate's own true per-resource extractor count,
  // so the two stay comparable.
  const factor = opts.extraExtractorYieldFactor ?? DEFAULT_EXTRA_EXTRACTOR_YIELD_FACTOR;
  const unitsPerHour =
    plan.fit.blocks *
    plan.chain.targetPerHour *
    madeTierFalloffRatio(plan.chain, plan.fit.blocks, opts.extractionRatePerHour, factor);
  return rejectOrScore(base, plan.fit, plan.throughput, unitsPerHour, cost.margin);
}

/**
 * How close two margins count as the same answer: one part in a million.
 * A margin is a float built from a price, a tax base and a block count, so
 * candidates equal in every way a pilot can see still differ in the last bits,
 * and an exact comparison lets that noise pick the winner instead of the rule.
 */
const MARGIN_TIE_EPSILON = 1e-6;

function marginsTied(a: number, b: number): boolean {
  return Math.abs(a - b) <= MARGIN_TIE_EPSILON * Math.max(Math.abs(a), Math.abs(b));
}

/**
 * The best candidate, in two passes rather than one sort.
 *
 * `marginsTied` is not transitive — A can tie B and B tie C while A and C sit
 * a tolerance apart — so using it inside a comparator makes that comparator
 * inconsistent, and `Array.prototype.sort` is then free to return any order at
 * all. It does: the same three candidates in a different input order elect a
 * different winner, including the deepest tier the rule below exists to
 * reject. So the maximum is taken first on a total order (the raw number),
 * and the tie rule is applied only among the candidates level with it.
 */
function bestOf(scored: readonly ScoredStopTier[]): ScoredStopTier {
  const top = scored.reduce((max, entry) => Math.max(max, entry.marginPerHour), -Infinity);
  return scored
    .filter((entry) => marginsTied(entry.marginPerHour, top) || entry.marginPerHour === top)
    .reduce((best, entry) =>
      entry.tier < best.tier || (entry.tier === best.tier && entry.typeId < best.typeId)
        ? entry
        : best
    );
}

const BLOCKER_BY_STATUS: Readonly<Record<StopTierEntry['status'], StopTierBlocker>> = {
  'does-not-fit': 'does-not-fit',
  'needs-price': 'needs-prices',
  'rejected-throughput': 'throughput',
  // Reached only when a scored candidate earned nothing above its customs tax;
  // a profitable one would have been recommended instead of asking this.
  scored: 'unprofitable',
};

/** What stopped every candidate, where one thing did. */
function blockerFor(entries: readonly StopTierEntry[]): StopTierBlocker {
  // A candidate the budget cannot host says nothing about prices or flow, so
  // it is set aside before the rest are read — otherwise one unfittable P4
  // would turn every colony's answer into 'mixed'.
  const fitted = entries.filter((entry) => entry.status !== 'does-not-fit');
  if (fitted.length === 0) return 'does-not-fit';
  const statuses = new Set(fitted.map((entry) => entry.status));
  return statuses.size === 1 ? BLOCKER_BY_STATUS[[...statuses][0]] : 'mixed';
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
  // One ECU costs what one ECU costs, so every raw candidate fits identically.
  const rawFit = fitColony({
    budget: opts.budget,
    infrastructure: opts.infrastructure,
    overhead: opts.overhead,
    block: { extractorControlUnit: 1 },
    headsPerExtractor: opts.headsPerExtractor,
    ...(opts.newLinkCost ? { newLinkCost: opts.newLinkCost } : {}),
  });
  const rawEntries = pi.raw
    .filter((resource) => local.has(resource.typeID))
    .map((resource) => scoreRawResource(resource.typeID, resource.name, rawFit, pi, opts));
  const madeEntries = localChainTargets(opts.localResources, pi)
    .map((typeId) => scoreProduct(typeId, pi, opts))
    .filter((entry): entry is StopTierEntry => entry !== null);

  const entries = [...rawEntries, ...madeEntries];
  if (entries.length === 0) return { kind: 'nothing-to-score', entries: [] };

  const scored = entries
    .filter((entry): entry is ScoredStopTier => entry.status === 'scored')
    .filter((entry) => entry.marginPerHour > 0);
  if (scored.length === 0) {
    return { kind: 'no-recommendation', blocker: blockerFor(entries), entries };
  }
  return { kind: 'recommended', best: bestOf(scored), entries };
}
