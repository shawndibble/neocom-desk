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
}

export interface NetworkInput {
  typeId: number;
  name: string;
  /** Units an hour this opportunity draws. */
  unitsPerHour: number;
  /** The colony that makes it. */
  fromPlanetId: number;
  /** True when that colony is the host, so the material crosses no customs office. */
  local: boolean;
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
  demandPerFactory: { typeId: number; name: string; unitsPerHour: number }[];
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
    // P2 only in this first cut; ADR 0012 records why P3 waits.
    if (tier !== 2) continue;

    const madeBy = schematic.inputs.map((input) =>
      opts.colonies.filter((c) => (c.outputPerHour.get(input.typeID) ?? 0) > 0)
    );
    if (madeBy.some((list) => list.length === 0)) continue;
    // Skip anything one colony could supply on its own.
    const selfSufficient = opts.colonies.some((colony) =>
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
      demandPerFactory: schematic.inputs.map((input) => ({
        typeId: input.typeID,
        name: input.name,
        unitsPerHour: (input.quantity * 3_600) / schematic.cycleTime,
      })),
      outputPerFactory: perHour,
      marginPerUnit: cost.margin,
      marginPerFactory: cost.margin * perHour,
    });
  }

  ok.sort((a, b) => b.marginPerFactory - a.marginPerFactory || a.typeId - b.typeId);
  return { ok, blocked };
}

/**
 * How many factories of one candidate a colony's leftover budget holds, with
 * the link each new pin needs.
 *
 * `spareCapacity` is the same call the "Room for" row makes, so a host is
 * chosen by exactly the rule the card states — one number cannot promise a
 * factory the other says will not fit.
 */
function hostCapacity(colony: NetworkColony, candidate: Candidate, opts: NetworkOptions): number {
  const room = spareCapacity({ cpu: 0, powergrid: 0 }, colony.spare, opts.infrastructure, {
    ...(colony.newLinkCost ? { newLinkCost: colony.newLinkCost } : {}),
  });
  return room[candidate.facility] ?? 0;
}

export function planNetwork(opts: NetworkOptions, pi: PiData): NetworkPlan {
  const { ok, blocked } = candidates(opts, pi);

  // One running pool for the whole set: the supply a better-paying line takes
  // is gone for the next, which is the constraint a per-candidate fit misses.
  const supply = new Map<number, number>();
  const supplierOf = new Map<number, number>();
  for (const colony of opts.colonies) {
    for (const [typeId, units] of colony.outputPerHour) {
      if (units <= 0) continue;
      supply.set(typeId, (supply.get(typeId) ?? 0) + units);
      // The colony that makes the most of it, so a two-source input names the
      // one a route would realistically come from.
      const best = supplierOf.get(typeId);
      const bestUnits =
        best === undefined
          ? -1
          : (opts.colonies.find((c) => c.planetId === best)?.outputPerHour.get(typeId) ?? 0);
      if (units > bestUnits) supplierOf.set(typeId, colony.planetId);
    }
  }

  const opportunities: NetworkOpportunity[] = [];
  const stillBlocked = [...blocked];

  for (const candidate of ok) {
    const bySupply = Math.min(
      ...candidate.demandPerFactory.map(
        (input) => (supply.get(input.typeId) ?? 0) / input.unitsPerHour
      )
    );
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
      const capacity = hostCapacity(colony, candidate, opts);
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
    const inputs: NetworkInput[] = candidate.demandPerFactory.map((input) => {
      const unitsPerHour = input.unitsPerHour * factories;
      supply.set(input.typeId, (supply.get(input.typeId) ?? 0) - unitsPerHour);
      const localHere = (host.colony.outputPerHour.get(input.typeId) ?? 0) > 0;
      return {
        typeId: input.typeId,
        name: input.name,
        unitsPerHour,
        fromPlanetId: localHere
          ? host.colony.planetId
          : (supplierOf.get(input.typeId) ?? host.colony.planetId),
        local: localHere,
      };
    });

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
    });
  }

  const unallocated = [...supply.entries()]
    .filter(([, units]) => units > EPSILON)
    .map(([typeId, unitsPerHour]) => ({ typeId, name: nameOf(typeId, pi), unitsPerHour }))
    .sort((a, b) => b.unitsPerHour - a.unitsPerHour);

  return { opportunities, unallocated, blocked: stillBlocked };
}
