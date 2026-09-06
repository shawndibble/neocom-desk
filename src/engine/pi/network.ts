/**
 * What a character's colonies could make **together** (ADR 0012).
 *
 * ## The gap this fills
 *
 * `stopTier.ts` asks what one planet can do from its own ground, and gates
 * candidates on that planet's own P0 closure — deliberately, because
 * recommending a P2 whose second input the planet cannot extract is the
 * confidently-wrong answer the Advisor exists to avoid. The consequence is
 * that a pilot running four colonies, each refining a different P0 into a
 * different P1, is told "keep selling raw" on all four cards, while the four
 * together reach four different P2s. On the reported operation those four are
 * Test Cultures, Water-Cooled CPU, Nanites and Superconductors, and one
 * Advanced factory turns 40 + 40 P1/hr into 5 P2/hr worth a fifth more.
 *
 * ## Two constraints, and the second is the one that is easy to forget
 *
 * A host colony needs the CPU and Powergrid for the factories — the same fit
 * the "Room for" row makes, including the link every new pin needs. But
 * material is the tighter constraint and it is **shared**: the four colonies
 * above make 141, 162, 227 and 264 P1/hr, one factory eats 80, and Water is an
 * input to three of the four best candidates. Fitting each candidate against
 * budget alone would recommend twenty factories where the material feeds nine
 * — promising capacity that is not there, one layer above where the same
 * defect was just fixed. So supply is allocated once, across the whole set.
 *
 * ## The allocation is greedy, and says so
 *
 * Candidates are ranked by ISK an hour per factory and given supply until an
 * input runs out. That is not provably optimal — a high-margin candidate can
 * eat an input several lower-margin ones needed — and ADR 0012 records the
 * choice: an exact solve is a small linear program, and a simplex is not worth
 * carrying for a set that is at most a handful of colonies. `unallocated`
 * comes back so a caller can show what the allocation left on the table.
 *
 * ## The margin is `chainCost`'s, not new arithmetic
 *
 * Routing your own P1 into a P2 instead of selling it is worth
 * `chainCost(chain, { sourcingFloor: 'P1', layout: 'single-planet' })`:
 * revenue on the P2, less the market price of the P1 inputs, less the import
 * tax onto the consuming planet, less the export tax on the P2. That *is* the
 * delta against selling the P1s raw — the export tax each P1 pays leaving its
 * own planet is incurred either way and cancels, and a P1's market price is
 * exactly the opportunity cost of routing it instead of selling it. So the
 * customs tables stay in their one home.
 *
 * Pure: colonies, prices, tax rate and the payload are all parameters. No
 * fetch, no clock, no Dexie.
 */

import type { PiData, PiInfrastructure, PiPinKind } from '@/sde/types';
import { chainCost, piTier } from './chain';
import { singleFactoryChain, spareCapacity } from './pinBudget';
import type { PinLoad, PiTier } from './types';

const SECONDS_PER_HOUR = 3_600;

/** Absorbs float drift so 5.0000000001 factories does not become 5 and a spare. */
const EPSILON = 1e-9;

export interface NetworkColony {
  planetId: number;
  /**
   * What this colony puts out an hour, by typeID — measured, from its own
   * factories' pin counts and its own extraction. A type it does not make is
   * absent, never zero.
   */
  outputPerHour: ReadonlyMap<number, number>;
  /**
   * CPU and Powergrid free for new pins, already net of everything this colony
   * draws today including its links.
   */
  spare: PinLoad;
  /** What a link this colony has not built would cost; null when unmeasurable. */
  newLinkCost: PinLoad | null;
  /**
   * This colony's own customs rate, for a set that spans more than one system.
   *
   * Only the *host's* rate ever enters a chain's cost: `chain.ts` charges
   * sourced material on exactly one boundary — the import onto the planet that
   * consumes it — and the export off that same planet. A supplying colony's own
   * export sits outside the chain's boundary set. So a plan can span systems
   * without a second tax model; it just cannot use one rate for every colony,
   * which is what `NetworkOptions.taxRate` alone forced.
   *
   * Falls back to `NetworkOptions.taxRate` when absent.
   */
  taxRate?: number;
  /**
   * Factories running here that are *fed* — candidates for conversion, with
   * what each one earns an hour so the exchange can be priced.
   *
   * Only fed ones belong here. A starved factory is `factoryBalance`'s
   * question and the card already answers it; offering to convert a pin that
   * makes nothing would double-count the same removal.
   */
  convertible?: readonly ConvertibleFacility[];
}

export interface ConvertibleFacility {
  facility: PiPinKind;
  /** How many of them are fed. */
  count: number;
  /** ISK an hour one of them nets: what it makes, less what it consumes. */
  marginPerHour: number;
  /** What one of them puts out, so removing it can be taken off the supply pool. */
  outputTypeId: number;
  outputPerHour: number;
}

export interface NetworkOptions {
  colonies: readonly NetworkColony[];
  infrastructure: PiInfrastructure;
  /** ISK per unit by typeID. A type the hub does not quote is absent, never zero. */
  prices: Readonly<Record<number, number>>;
  /**
   * What the hub pays, by typeID — its highest buy. Defaults to `prices`.
   *
   * A P2 factory here both buys (its bought inputs, at the ask) and sells (its
   * output, at the bid). Running one book through both halves credits the
   * spread twice.
   */
  revenuePrices?: Readonly<Record<number, number>>;
  /**
   * The customs rate to use for any colony that does not carry its own. Never
   * derived here — see `chain.ts`.
   */
  taxRate: number;
  /**
   * Let a candidate buy inputs no colony makes, at the hub's sell price.
   *
   * Off, the surface answers "what can these colonies make between them" and
   * a pilot whose colonies make no P2 is told nothing about a High-Tech
   * Production Plant except that one would fit. On, the same pilot is told
   * what to put in it and what it costs to get. The margin is `chainCost`'s
   * either way; this only widens which candidates are considered.
   */
  allowMarketSourcing?: boolean;
}

/**
 * Where an input comes from, which is the difference between a route to set up
 * and a haul to buy — and the pilot asked to be told which.
 *
 * `bought` costs the hub's sell price, which is exactly what `chainCost`
 * already charges for a sourced line, so the margin is the same arithmetic for
 * all three. What differs is the work: `local` is a link, `routed` is a link
 * plus a customs boundary, `bought` is a shopping trip.
 */
export type InputSource = 'local' | 'routed' | 'bought';

export interface NetworkInput {
  typeId: number;
  name: string;
  /** Units an hour this opportunity draws. */
  unitsPerHour: number;
  /** The colony that makes it; null when it is bought at the hub. */
  fromPlanetId: number | null;
  source: InputSource;
  /** ISK an hour this input costs — hub price either way, bought or forgone. */
  costPerHour: number;
}

export interface NetworkOpportunity {
  typeId: number;
  name: string;
  tier: PiTier;
  hostPlanetId: number;
  /** Factory pins to add on the host. */
  factories: number;
  /** The facility that runs it, from the payload's own schematic-to-pin map. */
  facility: PiPinKind;
  inputs: NetworkInput[];
  /** What those factories make an hour. */
  unitsPerHour: number;
  marginPerUnit: number;
  marginPerHour: number;
  /** ISK an hour of inputs that must be bought rather than routed. */
  buyCostPerHour: number;
  /** What the product itself sells for an hour, before inputs and tax. */
  revenuePerHour: number;
}

export type NetworkBlocker =
  /** No colony in the set has the CPU/Powergrid for even one factory. */
  | 'no-host-budget'
  /** The hub quotes no price for the product or one of its inputs. */
  | 'needs-price'
  /** It earns nothing above the customs office at this rate. */
  | 'unprofitable'
  /** Every unit of an input it needs went to a better-paying candidate. */
  | 'inputs-spoken-for'
  /**
   * No colony makes one of its inputs, and buying is off.
   *
   * Reported rather than skipped, because "you make one of the two things this
   * needs" is the most useful thing the Advisor can say to a pilot deciding
   * whether a hub run is worth it. Only candidates the set *partly* reaches are
   * listed: every other schematic in the game is also unreachable, and saying
   * so would be a catalogue rather than advice.
   */
  | 'needs-buying';

/**
 * "Remove these, build that instead" — an exchange, priced as one decision.
 *
 * Only ever offered against output the plan could not place. A factory whose
 * P1 is feeding an allocated opportunity is load-bearing, and tearing it down
 * would starve the very thing it feeds; a factory whose P1 nobody wanted is
 * simply worth less than what its budget could hold instead.
 */
export interface NetworkConversion {
  planetId: number;
  /** The fed factories to take out. */
  removeFacility: PiPinKind;
  removeCount: number;
  /** What they were making, and what they earned doing it. */
  removeName: string;
  removeMarginPerHour: number;
  /** What goes in their place, already costed and sourced. */
  add: NetworkOpportunity;
  /** The exchange's own worth: what is added, less what is given up. */
  netPerHour: number;
}

export interface NetworkPlan {
  /** Ranked, and allocated: the supply one line draws is gone for the next. */
  opportunities: NetworkOpportunity[];
  /**
   * Exchanges worth making on top of the allocation above: fed factories whose
   * output nothing wanted, and what their budget is worth instead.
   */
  conversions: NetworkConversion[];
  /** Output no opportunity claimed, still worth selling as it is. */
  unallocated: { typeId: number; name: string; unitsPerHour: number }[];
  /** Candidates that could not be recommended, and why — never silently dropped. */
  blocked: { typeId: number; name: string; reason: NetworkBlocker }[];
}

/** The name a product goes by, from whichever half of the payload carries it. */
function nameOf(typeId: number, pi: PiData): string {
  return (
    pi.schematics[String(typeId)]?.name ??
    pi.raw.find((resource) => resource.typeID === typeId)?.name ??
    String(typeId)
  );
}

function priceOf(typeId: number, prices: Readonly<Record<number, number>>): number | null {
  const price = prices[typeId];
  return price != null && Number.isFinite(price) ? price : null;
}

interface Candidate {
  typeId: number;
  name: string;
  tier: PiTier;
  facility: PiPinKind;
  /** Units an hour of each input one factory draws. */
  demandPerFactory: { typeId: number; name: string; unitsPerHour: number; bought: boolean }[];
  /** True when no colony makes any of its inputs — every unit is a purchase. */
  fullyBought: boolean;
  /** Units an hour one factory yields. */
  outputPerFactory: number;
  /**
   * What it pays at the best rate any colony in the set offers.
   *
   * Ranking needs one number per candidate and the margin now depends on which
   * colony hosts it, so this is the optimistic bound: a candidate cannot earn
   * more than this anywhere. Greedy ordering by an upper bound is still greedy
   * — ADR 0012 already records that the allocation is a good split rather than
   * a provably optimal one — and the figure a line actually reports is always
   * recomputed at its real host's rate.
   */
  marginPerUnit: number;
  marginPerFactory: number;
}

/**
 * Every P2 the colony set can reach that **no single colony already makes both
 * inputs for**.
 *
 * The exclusion is the whole point of a separate surface: a colony that can
 * feed a P2 by itself is `recommendStopTier`'s question, already answered on
 * its own card, and repeating it here would put one recommendation on the page
 * twice under two different framings.
 */
/** Every distinct customs rate in the set, and the kindest of them. */
function ratesOf(opts: NetworkOptions): { best: number; rateFor: (planetId: number) => number } {
  const byPlanet = new Map<number, number>();
  let best = Number.POSITIVE_INFINITY;
  for (const colony of opts.colonies) {
    const rate = colony.taxRate ?? opts.taxRate;
    byPlanet.set(colony.planetId, rate);
    best = Math.min(best, rate);
  }
  return {
    best: Number.isFinite(best) ? best : opts.taxRate,
    rateFor: (planetId) => byPlanet.get(planetId) ?? opts.taxRate,
  };
}

/**
 * What one factory of `candidate` earns an hour at a given customs rate.
 *
 * Memoised on (product, rate) rather than recomputed per host: a set spanning
 * three systems has three rates, not one per colony, and `chainCost` walks the
 * whole chain each time.
 */
function costerFor(opts: NetworkOptions, pi: PiData) {
  const cache = new Map<string, { marginPerUnit: number; marginPerFactory: number } | null>();
  return (typeId: number, outputPerFactory: number, taxRate: number) => {
    const key = `${typeId}:${taxRate}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const chain = singleFactoryChain(typeId, pi);
    let value: { marginPerUnit: number; marginPerFactory: number } | null = null;
    if (chain !== null) {
      // A candidate can source one P1 from a colony's own ground and buy the
      // other, so the chain's `sourcedBasis` — one basis for the whole chain
      // — cannot say both. `ownSourcedIds` charges each P1 the same way
      // `place()` prices the input line it becomes: at the bid for material a
      // colony in the set already makes, at the ask for what has to be bought.
      const ownSourcedIds = new Set(
        chain.nodes
          .filter((node) => node.tier === 1)
          .filter((node) => opts.colonies.some((c) => (c.outputPerHour.get(node.typeId) ?? 0) > 0))
          .map((node) => node.typeId)
      );
      const cost = chainCost(chain, {
        prices: opts.prices,
        ...(opts.revenuePrices ? { revenuePrices: opts.revenuePrices } : {}),
        sourcingFloor: 'P1',
        layout: 'single-planet',
        taxRate,
        ownSourcedIds,
      });
      if (cost.status === 'costed' && cost.margin > 0) {
        value = {
          marginPerUnit: cost.margin,
          marginPerFactory: cost.margin * outputPerFactory,
        };
      }
    }
    cache.set(key, value);
    return value;
  };
}

function candidates(
  opts: NetworkOptions,
  pi: PiData
): { ok: Candidate[]; blocked: NetworkPlan['blocked'] } {
  const ok: Candidate[] = [];
  const blocked: NetworkPlan['blocked'] = [];
  const { best } = ratesOf(opts);
  const cost0 = costerFor(opts, pi);

  for (const [key, schematic] of Object.entries(pi.schematics)) {
    const typeId = Number(key);
    const tier = piTier(typeId, pi);
    // P2 and P3. A High-Tech Production Plant eats two P2s, which no colony
    // here makes — so it is reachable only with buying on, and offering the
    // pin without ever saying what goes in it is the complaint this answers.
    if (tier !== 2 && tier !== 3) continue;

    const bought = schematic.inputs.map(
      (input) => !opts.colonies.some((c) => (c.outputPerHour.get(input.typeID) ?? 0) > 0)
    );
    if (bought.some(Boolean) && !opts.allowMarketSourcing) {
      // Partly reachable only: the set makes at least one of its inputs. A
      // candidate it makes none of is not news.
      if (!bought.every(Boolean)) {
        blocked.push({ typeId, name: schematic.name, reason: 'needs-buying' });
      }
      continue;
    }
    // Skip anything one colony could supply on its own *from its own ground*:
    // that is `recommendStopTier`'s question, already answered on its card,
    // and repeating it here would print one recommendation twice. A candidate
    // with a bought input is not that question and is never skipped.
    const selfSufficient =
      !bought.some(Boolean) &&
      opts.colonies.some((colony) =>
        schematic.inputs.every((input) => (colony.outputPerHour.get(input.typeID) ?? 0) > 0)
      );
    if (selfSufficient) continue;

    const name = schematic.name;
    const unpriced =
      [typeId, ...schematic.inputs.map((input) => input.typeID)].some(
        (id) => priceOf(id, opts.prices) === null
      ) || priceOf(typeId, opts.revenuePrices ?? opts.prices) === null;
    if (unpriced) {
      blocked.push({ typeId, name, reason: 'needs-price' });
      continue;
    }

    const chain = singleFactoryChain(typeId, pi);
    if (chain === null) continue;
    const perHour = chain.targetPerHour;
    // Screened at the kindest rate in the set: a product the customs office
    // eats there is eaten everywhere, and one that clears it there may still
    // fail at a worse office — which is checked again when a host is picked.
    const cost = cost0(typeId, perHour, best);
    if (cost === null) {
      blocked.push({ typeId, name, reason: 'unprofitable' });
      continue;
    }
    ok.push({
      typeId,
      name,
      tier,
      facility: schematic.facility,
      demandPerFactory: schematic.inputs.map((input, i) => ({
        typeId: input.typeID,
        name: input.name,
        unitsPerHour: (input.quantity * SECONDS_PER_HOUR) / schematic.cycleTime,
        bought: bought[i],
      })),
      fullyBought: bought.every(Boolean),
      outputPerFactory: perHour,
      marginPerUnit: cost.marginPerUnit,
      marginPerFactory: cost.marginPerFactory,
    });
  }

  // Margin first. Between two that pay the same, the one whose material the
  // pilot already makes wins — identical ISK, one less thing to haul.
  ok.sort(
    (a, b) =>
      b.marginPerFactory - a.marginPerFactory ||
      Number(a.fullyBought) - Number(b.fullyBought) ||
      a.typeId - b.typeId
  );
  return { ok, blocked };
}

/**
 * How many factories of one candidate a colony's *remaining* budget holds,
 * with the link each new pin needs.
 *
 * `spareCapacity` is the same call the "Room for" row makes, so a host is
 * chosen by exactly the rule the card states — one number cannot promise a
 * factory the other says will not fit.
 *
 * `remaining` rather than the colony's own `spare`, because two opportunities
 * can want the same host: budget is a pool like material is, and reading each
 * candidate against the untouched figure would put eight factories on a planet
 * that fits four.
 */
function hostCapacity(
  remaining: PinLoad,
  colony: NetworkColony,
  candidate: Candidate,
  opts: NetworkOptions
): number {
  const room = spareCapacity({ cpu: 0, powergrid: 0 }, remaining, opts.infrastructure, {
    ...(colony.newLinkCost ? { newLinkCost: colony.newLinkCost } : {}),
  });
  return room[candidate.facility] ?? 0;
}

/** What one factory of this candidate costs on this colony, link included. */
function factoryCost(colony: NetworkColony, candidate: Candidate, opts: NetworkOptions): PinLoad {
  const spec = opts.infrastructure.pins[candidate.facility];
  return {
    cpu: (spec?.cpu ?? 0) + (colony.newLinkCost?.cpu ?? 0),
    powergrid: (spec?.powergrid ?? 0) + (colony.newLinkCost?.powergrid ?? 0),
  };
}

export function planNetwork(opts: NetworkOptions, pi: PiData): NetworkPlan {
  const { ok, blocked } = candidates(opts, pi);
  const { rateFor } = ratesOf(opts);
  const cost0 = costerFor(opts, pi);

  // Supply is tracked per colony, not as one pool.
  //
  // The pooled total is still what bounds a candidate — material is shared —
  // but an opportunity has to name where each unit comes from, and naming the
  // largest producer for the whole draw is a lie whenever two colonies make
  // the same P1: "route 80/hr of Reactive Metals from Efa IV" when Efa IV
  // makes 60 is precisely the confidently-wrong number this tab exists to
  // avoid. Drawing colony by colony means a line either names a real source
  // for every unit or does not claim them.
  const supplyByColony = new Map<number, Map<number, number>>();
  for (const colony of opts.colonies) {
    const own = new Map<number, number>();
    for (const [typeId, units] of colony.outputPerHour) if (units > 0) own.set(typeId, units);
    supplyByColony.set(colony.planetId, own);
  }
  const pooled = (typeId: number): number => {
    let total = 0;
    for (const own of supplyByColony.values()) total += own.get(typeId) ?? 0;
    return total;
  };

  /**
   * Take `units` of `typeId` out of the set, nearest source first, and say
   * which colonies it came from.
   *
   * The host first — material already on the consuming planet crosses no
   * customs office — then the largest producer, so a draw is split across as
   * few routes as it can be.
   */
  const drawFrom = (
    typeId: number,
    units: number,
    hostPlanetId: number
  ): { fromPlanetId: number; unitsPerHour: number }[] => {
    const order = [...supplyByColony.entries()].sort(
      ([aId, aOwn], [bId, bOwn]) =>
        Number(bId === hostPlanetId) - Number(aId === hostPlanetId) ||
        (bOwn.get(typeId) ?? 0) - (aOwn.get(typeId) ?? 0) ||
        aId - bId
    );
    const taken: { fromPlanetId: number; unitsPerHour: number }[] = [];
    let left = units;
    for (const [planetId, own] of order) {
      if (left <= EPSILON) break;
      const available = own.get(typeId) ?? 0;
      if (available <= EPSILON) continue;
      const drawn = Math.min(left, available);
      own.set(typeId, available - drawn);
      taken.push({ fromPlanetId: planetId, unitsPerHour: drawn });
      left -= drawn;
    }
    return taken;
  };

  // Budget is a pool too. A candidate reads the host's *remaining* CPU and
  // Powergrid, and spends it, so the next candidate cannot be given the same
  // room over again.
  const remaining = new Map<number, PinLoad>(
    opts.colonies.map((colony) => [colony.planetId, { ...colony.spare }])
  );

  const opportunities: NetworkOpportunity[] = [];
  const stillBlocked = [...blocked];

  // Bought at the ask, routed at the bid: a purchase costs what the seller asks,
  // while consuming your own P1 costs the sale you give up, which is what a buy
  // order would have paid you. `chainCost` already charges both inside the
  // margin; these are the figures shown next to it.
  const boughtPrice = (typeId: number) => priceOf(typeId, opts.prices) ?? 0;
  const routedPrice = (typeId: number) => priceOf(typeId, opts.revenuePrices ?? opts.prices) ?? 0;

  /**
   * Put `factories` of `candidate` on `colony`: spend the budget, draw the
   * material, and describe what it costs and earns.
   *
   * A function rather than a block inside the allocation loop, because the
   * conversion pass below places factories the same way — and two copies of
   * this would be two places to forget to decrement a pool.
   */
  const place = (
    candidate: Candidate,
    colony: NetworkColony,
    factories: number,
    margin: { marginPerUnit: number; marginPerFactory: number }
  ): NetworkOpportunity => {
    const cost = factoryCost(colony, candidate, opts);
    const left = remaining.get(colony.planetId) ?? colony.spare;
    remaining.set(colony.planetId, {
      cpu: left.cpu - cost.cpu * factories,
      powergrid: left.powergrid - cost.powergrid * factories,
    });

    const inputs: NetworkInput[] = [];
    for (const input of candidate.demandPerFactory) {
      const unitsPerHour = input.unitsPerHour * factories;
      if (input.bought) {
        inputs.push({
          typeId: input.typeId,
          name: input.name,
          unitsPerHour,
          fromPlanetId: null,
          source: 'bought',
          costPerHour: boughtPrice(input.typeId) * unitsPerHour,
        });
        continue;
      }
      // One entry per contributing colony: two planets making the same P1 get
      // two routes, each for what that planet actually supplies.
      for (const part of drawFrom(input.typeId, unitsPerHour, colony.planetId)) {
        inputs.push({
          typeId: input.typeId,
          name: input.name,
          unitsPerHour: part.unitsPerHour,
          fromPlanetId: part.fromPlanetId,
          source: part.fromPlanetId === colony.planetId ? 'local' : 'routed',
          costPerHour: routedPrice(input.typeId) * part.unitsPerHour,
        });
      }
    }

    return {
      typeId: candidate.typeId,
      name: candidate.name,
      tier: candidate.tier,
      hostPlanetId: colony.planetId,
      factories,
      facility: candidate.facility,
      inputs,
      unitsPerHour: candidate.outputPerFactory * factories,
      marginPerUnit: margin.marginPerUnit,
      marginPerHour: margin.marginPerFactory * factories,
      buyCostPerHour: inputs
        .filter((input) => input.source === 'bought')
        .reduce((sum, input) => sum + input.costPerHour, 0),
      revenuePerHour:
        (priceOf(candidate.typeId, opts.revenuePrices ?? opts.prices) ?? 0) *
        candidate.outputPerFactory *
        factories,
    };
  };

  for (const candidate of ok) {
    // Only material the colonies make is scarce. A bought input constrains
    // nothing but the wallet, so it does not enter the supply bound — and a
    // candidate whose inputs are all bought is bounded by host budget alone.
    const grown = candidate.demandPerFactory.filter((input) => !input.bought);
    const bySupply = grown.length
      ? Math.min(...grown.map((input) => pooled(input.typeId) / input.unitsPerHour))
      : Number.POSITIVE_INFINITY;
    if (Math.floor(bySupply + EPSILON) < 1) {
      stillBlocked.push({
        typeId: candidate.typeId,
        name: candidate.name,
        reason: 'inputs-spoken-for',
      });
      continue;
    }

    // The host is the colony that earns the most from it — capacity times what
    // a factory clears *there*. Capacity alone was the rule while every colony
    // shared one customs rate; across systems it is not, and the roomiest
    // planet can be the one whose office takes the difference. Ties go to a
    // colony that already makes one of the inputs: one fewer customs boundary
    // and one fewer route to set up.
    let host: {
      colony: NetworkColony;
      factories: number;
      value: number;
      localInputs: number;
      margin: { marginPerUnit: number; marginPerFactory: number };
    } | null = null;
    let anyCapacity = false;
    for (const colony of opts.colonies) {
      const left = remaining.get(colony.planetId) ?? colony.spare;
      const capacity = hostCapacity(left, colony, candidate, opts);
      if (capacity <= 0) continue;
      anyCapacity = true;
      // Re-costed here: a candidate screened profitable at the kindest office
      // in the set can still be eaten by this one.
      const margin = cost0(candidate.typeId, candidate.outputPerFactory, rateFor(colony.planetId));
      if (margin === null) continue;
      const factories = Math.min(capacity, Math.floor(bySupply + EPSILON));
      if (factories < 1) continue;
      const value = factories * margin.marginPerFactory;
      const localInputs = candidate.demandPerFactory.filter(
        (input) => (colony.outputPerHour.get(input.typeId) ?? 0) > 0
      ).length;
      if (!host || value > host.value || (value === host.value && localInputs > host.localInputs)) {
        host = { colony, factories, value, localInputs, margin };
      }
    }
    if (!host) {
      stillBlocked.push({
        typeId: candidate.typeId,
        name: candidate.name,
        // Room but no profit anywhere is a different fact from no room at all.
        reason: anyCapacity ? 'unprofitable' : 'no-host-budget',
      });
      continue;
    }

    opportunities.push(place(candidate, host.colony, host.factories, host.margin));
  }

  // --- What to take down, and what to put up instead -----------------------
  //
  // The allocation above spent every scrap of material it could use. Whatever
  // is still sitting in `supplyByColony` is P1 that nothing wanted — and the
  // factory making it is holding CPU and Powergrid that something else could
  // pay more for.
  //
  // Only unwanted output is convertible, and that restriction is what makes
  // the exchange safe: a factory whose P1 feeds an allocated opportunity is
  // load-bearing, and removing it would starve the very line it feeds. Reading
  // the pools *after* allocation is what tells the two apart, so this pass
  // cannot run before that one.
  const conversions: NetworkConversion[] = [];
  for (const colony of opts.colonies) {
    const own = supplyByColony.get(colony.planetId);
    if (!own) continue;
    for (const group of colony.convertible ?? []) {
      if (group.count <= 0 || group.outputPerHour <= 0) continue;
      const unwanted = own.get(group.outputTypeId) ?? 0;
      // Whole factories only: half a factory's worth of unsold P1 is not a
      // factory you can take down.
      const spare = Math.min(group.count, Math.floor(unwanted / group.outputPerHour + EPSILON));
      if (spare < 1) continue;

      const spec = opts.infrastructure.pins[group.facility];
      if (!spec) continue;

      // Best exchange over how many come out and what goes up in their place.
      // Both matter: removing two frees enough for a pin that one does not.
      let best: {
        remove: number;
        candidate: Candidate;
        factories: number;
        net: number;
        margin: { marginPerUnit: number; marginPerFactory: number };
      } | null = null;
      // This colony's own office, not the set's best: an exchange is only ever
      // made here, so what the replacement clears here is the only figure that
      // decides whether it beats what is coming down.
      const rate = rateFor(colony.planetId);
      const left = remaining.get(colony.planetId) ?? colony.spare;
      for (let remove = 1; remove <= spare; remove += 1) {
        const budget = {
          cpu: left.cpu + spec.cpu * remove,
          powergrid: left.powergrid + spec.powergrid * remove,
        };
        for (const candidate of ok) {
          const byBudget = hostCapacity(budget, colony, candidate, opts);
          if (byBudget < 1) continue;
          // The removed factories' own output goes with them, so a candidate
          // that eats it can only count what survives the removal.
          const grown = candidate.demandPerFactory.filter((input) => !input.bought);
          const bySupply = grown.length
            ? Math.min(
                ...grown.map((input) => {
                  const pool =
                    pooled(input.typeId) -
                    (input.typeId === group.outputTypeId ? group.outputPerHour * remove : 0);
                  return pool / input.unitsPerHour;
                })
              )
            : Number.POSITIVE_INFINITY;
          const factories = Math.min(byBudget, Math.floor(bySupply + EPSILON));
          if (factories < 1) continue;
          const margin = cost0(candidate.typeId, candidate.outputPerFactory, rate);
          if (margin === null) continue;
          const net = factories * margin.marginPerFactory - remove * group.marginPerHour;
          if (!best || net > best.net) best = { remove, candidate, factories, net, margin };
        }
      }
      if (!best || best.net <= 0) continue;

      // Apply it. The freed budget is credited before `place` spends it, and
      // the removed factories' output leaves the pool with them — otherwise a
      // later line could be routed P1 that no longer exists.
      const freed = {
        cpu: left.cpu + spec.cpu * best.remove,
        powergrid: left.powergrid + spec.powergrid * best.remove,
      };
      remaining.set(colony.planetId, freed);
      own.set(group.outputTypeId, unwanted - group.outputPerHour * best.remove);

      conversions.push({
        planetId: colony.planetId,
        removeFacility: group.facility,
        removeCount: best.remove,
        removeName: nameOf(group.outputTypeId, pi),
        removeMarginPerHour: group.marginPerHour * best.remove,
        add: place(best.candidate, colony, best.factories, best.margin),
        netPerHour: best.net,
      });
    }
  }
  conversions.sort((a, b) => b.netPerHour - a.netPerHour);

  const leftover = new Map<number, number>();
  for (const own of supplyByColony.values()) {
    for (const [typeId, units] of own) {
      if (units > EPSILON) leftover.set(typeId, (leftover.get(typeId) ?? 0) + units);
    }
  }
  const unallocated = [...leftover.entries()]
    .map(([typeId, unitsPerHour]) => ({ typeId, name: nameOf(typeId, pi), unitsPerHour }))
    .sort((a, b) => b.unitsPerHour - a.unitsPerHour);

  return { opportunities, conversions, unallocated, blocked: stillBlocked };
}
