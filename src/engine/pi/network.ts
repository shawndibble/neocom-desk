import type { PiData, PiInfrastructure, PiPinKind } from '@/sde/types';
import { chainCost, piTier } from './chain';
import { singleFactoryChain, spareCapacity } from './pinBudget';
import { rawById } from './rawIndex';
import type { PinLoad, PiTier } from './types';

const SECONDS_PER_HOUR = 3_600;

const EPSILON = 1e-9;

export interface NetworkColony {
  planetId: number;
  exportablePerHour: ReadonlyMap<number, number>;
  spare: PinLoad;
  newLinkCost: PinLoad | null;
  taxRate?: number;
  convertible?: readonly ConvertibleFacility[];
}

export interface ConvertibleFacility {
  facility: PiPinKind;
  count: number;
  marginPerHour: number;
  outputTypeId: number;
  outputPerHour: number;
}

export interface NetworkOptions {
  colonies: readonly NetworkColony[];
  infrastructure: PiInfrastructure;
  prices: Readonly<Record<number, number>>;
  revenuePrices?: Readonly<Record<number, number>>;
  taxRate: number;
  salesTaxPct: number;
  allowMarketSourcing?: boolean;
}

export type InputSource = 'local' | 'routed' | 'bought';

export interface NetworkInput {
  typeId: number;
  name: string;
  unitsPerHour: number;
  fromPlanetId: number | null;
  source: InputSource;
  costPerHour: number;
}

export interface NetworkOpportunity {
  typeId: number;
  name: string;
  tier: PiTier;
  hostPlanetId: number;
  factories: number;
  facility: PiPinKind;
  inputs: NetworkInput[];
  unitsPerHour: number;
  marginPerUnit: number;
  marginPerHour: number;
  buyCostPerHour: number;
  revenuePerHour: number;
}

export type NetworkBlocker =
  'no-host-budget' | 'needs-price' | 'unprofitable' | 'inputs-spoken-for' | 'needs-buying';

export interface NetworkConversion {
  planetId: number;
  removeFacility: PiPinKind;
  removeCount: number;
  removeName: string;
  removeMarginPerHour: number;
  add: NetworkOpportunity;
  netPerHour: number;
}

export interface NetworkPlan {
  opportunities: NetworkOpportunity[];
  conversions: NetworkConversion[];
  unallocated: { typeId: number; name: string; unitsPerHour: number }[];
  blocked: { typeId: number; name: string; reason: NetworkBlocker }[];
}

function nameOf(typeId: number, pi: PiData): string {
  return pi.schematics[String(typeId)]?.name ?? rawById(pi).get(typeId)?.name ?? String(typeId);
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
  demandPerFactory: { typeId: number; name: string; unitsPerHour: number; bought: boolean }[];
  fullyBought: boolean;
  outputPerFactory: number;
  marginPerUnit: number;
  marginPerFactory: number;
}

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

function costerFor(opts: NetworkOptions, pi: PiData) {
  const cache = new Map<string, { marginPerUnit: number; marginPerFactory: number } | null>();
  return (typeId: number, outputPerFactory: number, taxRate: number) => {
    const key = `${typeId}:${taxRate}`;
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const chain = singleFactoryChain(typeId, pi);
    let value: { marginPerUnit: number; marginPerFactory: number } | null = null;
    if (chain !== null) {
      const ownSourcedIds = new Set(
        chain.nodes
          .filter((node) => node.tier === 1)
          .filter((node) =>
            opts.colonies.some((c) => (c.exportablePerHour.get(node.typeId) ?? 0) > 0)
          )
          .map((node) => node.typeId)
      );
      const cost = chainCost(chain, {
        prices: opts.prices,
        ...(opts.revenuePrices ? { revenuePrices: opts.revenuePrices } : {}),
        sourcingFloor: 'P1',
        layout: 'single-planet',
        taxRate,
        salesTaxPct: opts.salesTaxPct,
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
    if (tier !== 2 && tier !== 3) continue;

    const bought = schematic.inputs.map(
      (input) => !opts.colonies.some((c) => (c.exportablePerHour.get(input.typeID) ?? 0) > 0)
    );
    if (bought.some(Boolean) && !opts.allowMarketSourcing) {
      if (!bought.every(Boolean)) {
        blocked.push({ typeId, name: schematic.name, reason: 'needs-buying' });
      }
      continue;
    }
    const selfSufficient =
      !bought.some(Boolean) &&
      opts.colonies.some((colony) =>
        schematic.inputs.every((input) => (colony.exportablePerHour.get(input.typeID) ?? 0) > 0)
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

  ok.sort(
    (a, b) =>
      b.marginPerFactory - a.marginPerFactory ||
      Number(a.fullyBought) - Number(b.fullyBought) ||
      a.typeId - b.typeId
  );
  return { ok, blocked };
}

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

  const supplyByColony = new Map<number, Map<number, number>>();
  for (const colony of opts.colonies) {
    const own = new Map<number, number>();
    for (const [typeId, units] of colony.exportablePerHour) if (units > 0) own.set(typeId, units);
    supplyByColony.set(colony.planetId, own);
  }
  const pooled = (typeId: number): number => {
    let total = 0;
    for (const own of supplyByColony.values()) total += own.get(typeId) ?? 0;
    return total;
  };

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

  const remaining = new Map<number, PinLoad>(
    opts.colonies.map((colony) => [colony.planetId, { ...colony.spare }])
  );

  const opportunities: NetworkOpportunity[] = [];
  const stillBlocked = [...blocked];

  const boughtPrice = (typeId: number) => priceOf(typeId, opts.prices) ?? 0;
  const routedPrice = (typeId: number) => priceOf(typeId, opts.revenuePrices ?? opts.prices) ?? 0;

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
      const margin = cost0(candidate.typeId, candidate.outputPerFactory, rateFor(colony.planetId));
      if (margin === null) continue;
      const factories = Math.min(capacity, Math.floor(bySupply + EPSILON));
      if (factories < 1) continue;
      const value = factories * margin.marginPerFactory;
      const localInputs = candidate.demandPerFactory.filter(
        (input) => (colony.exportablePerHour.get(input.typeId) ?? 0) > 0
      ).length;
      if (!host || value > host.value || (value === host.value && localInputs > host.localInputs)) {
        host = { colony, factories, value, localInputs, margin };
      }
    }
    if (!host) {
      stillBlocked.push({
        typeId: candidate.typeId,
        name: candidate.name,
        reason: anyCapacity ? 'unprofitable' : 'no-host-budget',
      });
      continue;
    }

    opportunities.push(place(candidate, host.colony, host.factories, host.margin));
  }

  const conversions: NetworkConversion[] = [];
  for (const colony of opts.colonies) {
    const own = supplyByColony.get(colony.planetId);
    if (!own) continue;
    for (const group of colony.convertible ?? []) {
      if (group.count <= 0 || group.outputPerHour <= 0) continue;
      const unwanted = own.get(group.outputTypeId) ?? 0;
      const spare = Math.min(group.count, Math.floor(unwanted / group.outputPerHour + EPSILON));
      if (spare < 1) continue;

      const spec = opts.infrastructure.pins[group.facility];
      if (!spec) continue;

      let best: {
        remove: number;
        candidate: Candidate;
        factories: number;
        net: number;
        margin: { marginPerUnit: number; marginPerFactory: number };
      } | null = null;
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
