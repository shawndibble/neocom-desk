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
}

export interface NetworkOptions {
  colonies: readonly NetworkColony[];
  infrastructure: PiInfrastructure;
  /** ISK per unit by typeID. A type the hub does not quote is absent, never zero. */
  prices: Readonly<Record<number, number>>;
  /** The customs rate. Never derived here — see `chain.ts`. */
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
  | 'inputs-spoken-for';

export interface NetworkPlan {
  /** Ranked, and allocated: the supply one line draws is gone for the next. */
  opportunities: NetworkOpportunity[];
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
function candidates(
  opts: NetworkOptions,
  pi: PiData
): { ok: Candidate[]; blocked: NetworkPlan['blocked'] } {
  const ok: Candidate[] = [];
  const blocked: NetworkPlan['blocked'] = [];

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
    if (bought.some(Boolean) && !opts.allowMarketSourcing) continue;
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
    const unpriced = [typeId, ...schematic.inputs.map((input) => input.typeID)].some(
      (id) => priceOf(id, opts.prices) === null
    );
    if (unpriced) {
      blocked.push({ typeId, name, reason: 'needs-price' });
      continue;
    }

    const chain = singleFactoryChain(typeId, pi);
    if (chain === null) continue;
    const cost = chainCost(chain, {
      prices: opts.prices,
      sourcingFloor: 'P1',
      // Every made tier of a P2 chain sourced at P1 is the P2 itself, and it
      // sits on the host: one planet, so no boundary between made tiers.
      layout: 'single-planet',
      taxRate: opts.taxRate,
    });
    if (cost.status !== 'costed') continue;
    if (cost.margin <= 0) {
      blocked.push({ typeId, name, reason: 'unprofitable' });
      continue;
    }

    const perHour = chain.targetPerHour;
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
      marginPerUnit: cost.margin,
      marginPerFactory: cost.margin * perHour,
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

    // The host is the colony that can take the most of it. Ties go to a
    // colony that already makes one of the inputs, which is one fewer customs
    // boundary and one fewer route to set up.
    let host: { colony: NetworkColony; capacity: number; localInputs: number } | null = null;
    for (const colony of opts.colonies) {
      const left = remaining.get(colony.planetId) ?? colony.spare;
      const capacity = hostCapacity(left, colony, candidate, opts);
      if (capacity <= 0) continue;
      const localInputs = candidate.demandPerFactory.filter(
        (input) => (colony.outputPerHour.get(input.typeId) ?? 0) > 0
      ).length;
      if (
        !host ||
        capacity > host.capacity ||
        (capacity === host.capacity && localInputs > host.localInputs)
      ) {
        host = { colony, capacity, localInputs };
      }
    }
    if (!host) {
      stillBlocked.push({
        typeId: candidate.typeId,
        name: candidate.name,
        reason: 'no-host-budget',
      });
      continue;
    }

    const factories = Math.min(host.capacity, Math.floor(bySupply + EPSILON));

    const cost = factoryCost(host.colony, candidate, opts);
    const left = remaining.get(host.colony.planetId) ?? host.colony.spare;
    remaining.set(host.colony.planetId, {
      cpu: left.cpu - cost.cpu * factories,
      powergrid: left.powergrid - cost.powergrid * factories,
    });

    // Priced the same whether bought or grown: `chainCost` charges the hub
    // price for a sourced line either way, because routing your own P1 forgoes
    // selling it for exactly that.
    const price = (typeId: number) => priceOf(typeId, opts.prices) ?? 0;
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
          costPerHour: price(input.typeId) * unitsPerHour,
        });
        continue;
      }
      // One entry per contributing colony: two planets making the same P1 get
      // two routes, each for what that planet actually supplies.
      for (const part of drawFrom(input.typeId, unitsPerHour, host.colony.planetId)) {
        inputs.push({
          typeId: input.typeId,
          name: input.name,
          unitsPerHour: part.unitsPerHour,
          fromPlanetId: part.fromPlanetId,
          source: part.fromPlanetId === host.colony.planetId ? 'local' : 'routed',
          costPerHour: price(input.typeId) * part.unitsPerHour,
        });
      }
    }

    opportunities.push({
      typeId: candidate.typeId,
      name: candidate.name,
      tier: candidate.tier,
      hostPlanetId: host.colony.planetId,
      factories,
      facility: candidate.facility,
      inputs,
      unitsPerHour: candidate.outputPerFactory * factories,
      marginPerUnit: candidate.marginPerUnit,
      marginPerHour: candidate.marginPerFactory * factories,
      buyCostPerHour: inputs
        .filter((input) => input.source === 'bought')
        .reduce((sum, input) => sum + input.costPerHour, 0),
      revenuePerHour:
        (priceOf(candidate.typeId, opts.prices) ?? 0) * candidate.outputPerFactory * factories,
    });
  }

  const leftover = new Map<number, number>();
  for (const own of supplyByColony.values()) {
    for (const [typeId, units] of own) {
      if (units > EPSILON) leftover.set(typeId, (leftover.get(typeId) ?? 0) + units);
    }
  }
  const unallocated = [...leftover.entries()]
    .map(([typeId, unitsPerHour]) => ({ typeId, name: nameOf(typeId, pi), unitsPerHour }))
    .sort((a, b) => b.unitsPerHour - a.unitsPerHour);

  return { opportunities, unallocated, blocked: stillBlocked };
}
