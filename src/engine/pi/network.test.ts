import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { piTier } from './chain';
import { planNetwork, type NetworkColony, type ConvertibleFacility } from './network';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const BACTERIA = 2393;
const REACTIVE_METALS = 2398;
const WATER = 3645;
const PLASMOIDS = 2389;
const TEST_CULTURES = 2319;
const WATER_COOLED_CPU = 2328;
const NANITES = 2463;
const SUPERCONDUCTORS = 9838;

const PRICES: Record<number, number> = {
  [BACTERIA]: 490,
  [REACTIVE_METALS]: 392.2,
  [WATER]: 513.9,
  [PLASMOIDS]: 600.2,
  [TEST_CULTURES]: 10_000,
  [WATER_COOLED_CPU]: 7_600,
  [NANITES]: 8_500,
  [SUPERCONDUCTORS]: 11_280,
};

const TIER_LADDER = [12, 450, 9_000, 90_000, 1_200_000];
const ALL_PRICES: Record<number, number> = (() => {
  const out: Record<number, number> = {};
  for (const resource of pi.raw) out[resource.typeID] = TIER_LADDER[0];
  for (const key of Object.keys(pi.schematics)) {
    const typeId = Number(key);
    out[typeId] = TIER_LADDER[piTier(typeId, pi)];
  }
  return { ...out, ...PRICES };
})();

const ROOMY = { cpu: 100_000, powergrid: 100_000 };

function colony(planetId: number, typeId: number, unitsPerHour: number): NetworkColony {
  return {
    planetId,
    exportablePerHour: new Map([[typeId, unitsPerHour]]),
    spare: ROOMY,
    newLinkCost: { cpu: 30, powergrid: 21 },
  };
}

const EFA: NetworkColony[] = [
  colony(40_246_311, BACTERIA, 141.34),
  colony(40_246_332, REACTIVE_METALS, 162.08),
  colony(40_246_354, WATER, 226.69),
  colony(40_246_380, PLASMOIDS, 264.42),
];

const options = {
  colonies: EFA,
  infrastructure: pi.infrastructure,
  prices: PRICES,
  taxRate: 0,
  salesTaxPct: 0,
};

describe('planNetwork', () => {
  it('finds the P2 two colonies can make that neither can make alone', () => {
    const plan = planNetwork(options, pi);
    const names = plan.opportunities.map((line) => line.name);
    expect(names).toContain('Superconductors');
    expect(names).toContain('Nanites');
  });

  it('ranks by what a factory earns, and spends the scarcest input on the best', () => {
    const plan = planNetwork(options, pi);
    expect(plan.opportunities[0].name).toBe('Superconductors');
    expect(plan.opportunities[0].marginPerHour).toBeGreaterThan(
      plan.opportunities[1].marginPerHour
    );
    const superconductors = plan.opportunities[0];
    expect(superconductors.factories).toBe(5);
    const total = plan.opportunities.reduce((sum, line) => sum + line.marginPerHour, 0);
    expect(Math.round(total)).toBe(80_816);
  });

  it('never allocates a P1 twice', () => {
    const plan = planNetwork(options, pi);
    const drawn = new Map<number, number>();
    for (const line of plan.opportunities) {
      for (const input of line.inputs) {
        drawn.set(input.typeId, (drawn.get(input.typeId) ?? 0) + input.unitsPerHour);
      }
    }
    expect(drawn.get(WATER) ?? 0).toBeLessThanOrEqual(226.69 + 1e-6);
    expect(drawn.get(BACTERIA) ?? 0).toBeLessThanOrEqual(141.34 + 1e-6);
  });

  it('names where every input comes from, and which are already on the host', () => {
    const plan = planNetwork(options, pi);
    const line = plan.opportunities[0];
    const sources = new Set(line.inputs.map((input) => input.fromPlanetId));
    expect(sources.size).toBe(2);
    expect(sources).toContain(line.hostPlanetId);
    expect(line.inputs.filter((input) => input.source === 'local')).toHaveLength(1);
  });

  it('will not put factories on a colony that has no budget for them', () => {
    const tight = EFA.map((entry, i) =>
      i === 2 ? entry : { ...entry, spare: { cpu: 100, powergrid: 100 } }
    );
    const plan = planNetwork({ ...options, colonies: tight }, pi);
    for (const line of plan.opportunities) expect(line.hostPlanetId).toBe(40_246_354);
  });

  it('never spends the same colony’s budget twice', () => {
    const oneRoomyHost = EFA.map((entry, i) =>
      i === 0
        ? {
            ...entry,
            spare: { cpu: 4 * 530, powergrid: 4 * 721 },
            newLinkCost: { cpu: 30, powergrid: 21 },
          }
        : { ...entry, spare: { cpu: 0, powergrid: 0 } }
    );
    const plan = planNetwork({ ...options, colonies: oneRoomyHost }, pi);
    const onHost = plan.opportunities
      .filter((line) => line.hostPlanetId === 40_246_311)
      .reduce((sum, line) => sum + line.factories, 0);
    expect(onHost).toBeLessThanOrEqual(4);
    expect(onHost).toBeGreaterThan(0);
  });

  it('reports a candidate nothing can host rather than dropping it', () => {
    const full = EFA.map((entry) => ({ ...entry, spare: { cpu: 0, powergrid: 0 } }));
    const plan = planNetwork({ ...options, colonies: full }, pi);
    expect(plan.opportunities).toEqual([]);
    expect(plan.blocked.map((line) => line.name)).toContain('Superconductors');
    const feedable = plan.blocked.filter((line) => line.reason !== 'needs-buying');
    expect(feedable.every((line) => line.reason === 'no-host-budget')).toBe(true);
    expect(feedable.map((line) => line.name)).toContain('Superconductors');
  });

  it('leaves a type the hub does not quote unpriced rather than valuing it at zero', () => {
    const rest = Object.fromEntries(
      Object.entries(PRICES).filter(([typeId]) => Number(typeId) !== SUPERCONDUCTORS)
    );
    const plan = planNetwork({ ...options, prices: rest }, pi);
    expect(plan.opportunities.map((line) => line.name)).not.toContain('Superconductors');
    const blocked = plan.blocked.find((line) => line.name === 'Superconductors');
    expect(blocked?.reason).toBe('needs-price');
  });

  it('says nothing about a P2 one colony could already make by itself', () => {
    const selfSufficient: NetworkColony[] = [
      {
        planetId: 1,
        exportablePerHour: new Map([
          [BACTERIA, 200],
          [WATER, 200],
        ]),
        spare: ROOMY,
        newLinkCost: null,
      },
    ];
    const plan = planNetwork({ ...options, colonies: selfSufficient }, pi);
    expect(plan.opportunities).toEqual([]);
  });

  it('charges the customs office on the way in and on the way out', () => {
    const free = planNetwork(options, pi);
    const taxed = planNetwork({ ...options, taxRate: 0.1 }, pi);
    const best = (plan: typeof free) =>
      plan.opportunities.find((line) => line.name === 'Superconductors');
    expect(best(taxed)?.marginPerUnit).toBeLessThan(best(free)?.marginPerUnit ?? 0);
  });

  it('drops a candidate the tax turns unprofitable rather than recommending a loss', () => {
    const plan = planNetwork({ ...options, taxRate: 0.9 }, pi);
    for (const line of plan.opportunities) expect(line.marginPerHour).toBeGreaterThan(0);
  });

  it('nets sales tax off a candidate’s revenue, lowering its margin', () => {
    const untaxed = planNetwork(options, pi);
    const taxed = planNetwork({ ...options, salesTaxPct: 7.5 }, pi);
    const best = (plan: typeof untaxed) =>
      plan.opportunities.find((line) => line.name === 'Superconductors');
    expect(best(taxed)?.marginPerUnit).toBeLessThan(best(untaxed)?.marginPerUnit ?? 0);
  });

  it('reports the P1 still worth selling raw, so the panel can say what is left over', () => {
    const plan = planNetwork(options, pi);
    const left = plan.unallocated.find((line) => line.typeId === PLASMOIDS);
    expect(left?.unitsPerHour).toBeCloseTo(64.42, 4);
  });

  it('leaves a product nobody has the inputs for alone unless buying is allowed', () => {
    const off = planNetwork(options, pi);
    expect(off.opportunities.every((line) => line.tier === 2)).toBe(true);

    const on = planNetwork({ ...options, prices: ALL_PRICES, allowMarketSourcing: true }, pi);
    expect(on.opportunities.some((line) => line.tier === 3)).toBe(true);
  });

  it('names a bought input as bought, and prices it at the hub', () => {
    const plan = planNetwork({ ...options, prices: ALL_PRICES, allowMarketSourcing: true }, pi);
    const bought = plan.opportunities
      .flatMap((line) => line.inputs)
      .find((input) => input.source === 'bought');
    expect(bought).toBeDefined();
    expect(bought?.fromPlanetId).toBeNull();
    expect(bought?.costPerHour).toBeGreaterThan(0);
  });

  it('does not let a bought input pretend to be scarce', () => {
    const plan = planNetwork({ ...options, prices: ALL_PRICES, allowMarketSourcing: true }, pi);
    const drawn = new Map<number, number>();
    for (const line of plan.opportunities) {
      for (const input of line.inputs) {
        if (input.source === 'bought') continue;
        drawn.set(input.typeId, (drawn.get(input.typeId) ?? 0) + input.unitsPerHour);
      }
    }
    expect(drawn.get(WATER) ?? 0).toBeLessThanOrEqual(226.69 + 1e-6);
    expect(drawn.get(BACTERIA) ?? 0).toBeLessThanOrEqual(141.34 + 1e-6);
  });

  it('prefers material the pilot already makes when two products pay the same', () => {
    const flat: Record<number, number> = {};
    for (const resource of pi.raw) flat[resource.typeID] = 12;
    for (const key of Object.keys(pi.schematics)) {
      const typeId = Number(key);
      if (piTier(typeId, pi) === 2) flat[typeId] = 9_000;
      else if (piTier(typeId, pi) === 1) flat[typeId] = 450;
    }
    const plan = planNetwork({ ...options, prices: flat, allowMarketSourcing: true }, pi);
    expect(plan.opportunities[0].inputs.some((input) => input.source !== 'bought')).toBe(true);
  });

  it('reports what a line sells for and what its shopping costs', () => {
    const plan = planNetwork({ ...options, prices: ALL_PRICES, allowMarketSourcing: true }, pi);
    for (const line of plan.opportunities) {
      expect(line.revenuePerHour).toBeGreaterThan(0);
      expect(line.buyCostPerHour).toBeGreaterThanOrEqual(0);
      expect(line.marginPerHour).toBeGreaterThan(0);
    }
  });

  it('never names a planet for more material than that planet makes', () => {
    const split: NetworkColony[] = [
      colony(1, BACTERIA, 200),
      colony(2, REACTIVE_METALS, 60),
      colony(3, REACTIVE_METALS, 100),
    ];
    const plan = planNetwork({ ...options, colonies: split }, pi);
    const made = new Map([
      [1, new Map([[BACTERIA, 200]])],
      [2, new Map([[REACTIVE_METALS, 60]])],
      [3, new Map([[REACTIVE_METALS, 100]])],
    ]);
    const drawn = new Map<string, number>();
    for (const line of plan.opportunities) {
      for (const input of line.inputs) {
        if (input.fromPlanetId === null) continue;
        const key = `${input.fromPlanetId}:${input.typeId}`;
        drawn.set(key, (drawn.get(key) ?? 0) + input.unitsPerHour);
      }
    }
    for (const [key, units] of drawn) {
      const [planetId, typeId] = key.split(':').map(Number);
      expect(units).toBeLessThanOrEqual((made.get(planetId)?.get(typeId) ?? 0) + 1e-6);
    }
    const nanites = plan.opportunities.find((entry) => entry.name === 'Nanites');
    expect(nanites?.inputs.filter((input) => input.typeId === REACTIVE_METALS).length).toBe(2);
  });

  it('says which products are one hub run away when buying is off', () => {
    const plan = planNetwork({ ...options, prices: ALL_PRICES }, pi);
    const named = plan.blocked.filter((line) => line.reason === 'needs-buying');
    expect(named.length).toBeGreaterThan(0);
    for (const line of named) {
      const schematic = pi.schematics[String(line.typeId)];
      const made = schematic.inputs.filter((input) =>
        EFA.some((entry) => (entry.exportablePerHour.get(input.typeID) ?? 0) > 0)
      );
      expect(made.length).toBeGreaterThan(0);
      expect(made.length).toBeLessThan(schematic.inputs.length);
    }
  });

  it('has nothing to say about a single colony, or none', () => {
    expect(planNetwork({ ...options, colonies: [] }, pi).opportunities).toEqual([]);
    expect(planNetwork({ ...options, colonies: [EFA[0]] }, pi).opportunities).toEqual([]);
  });
});

describe('planNetwork conversions', () => {
  const P2_ONLY: Record<number, number> = (() => {
    const out: Record<number, number> = {};
    for (const resource of pi.raw) out[resource.typeID] = 12;
    for (const key of Object.keys(pi.schematics)) {
      const typeId = Number(key);
      if (piTier(typeId, pi) === 1) out[typeId] = 450;
      else if (piTier(typeId, pi) === 2) out[typeId] = 9_000;
    }
    return out;
  })();

  const convertible = (
    typeId: number,
    facilities: number,
    marginPerHour: number
  ): ConvertibleFacility => ({
    facility: 'basic',
    count: facilities,
    marginPerHour,
    outputTypeId: typeId,
    outputPerHour: 40,
  });

  const overSupplied: NetworkColony[] = [
    { ...colony(1, BACTERIA, 141.34), spare: { cpu: 20_000, powergrid: 3_000 } },
    {
      ...colony(2, REACTIVE_METALS, 320),
      spare: { cpu: 20_000, powergrid: 3_000 },
      convertible: [convertible(REACTIVE_METALS, 8, 2_620)],
    },
  ];

  it('offers to convert only the factories whose output nothing wanted', () => {
    const plan = planNetwork(
      { ...options, colonies: overSupplied, prices: P2_ONLY, allowMarketSourcing: true },
      pi
    );
    const conversion = plan.conversions.find((entry) => entry.planetId === 2);
    expect(conversion).toBeDefined();
    expect(conversion?.removeCount).toBeGreaterThan(0);
    expect(conversion?.removeCount).toBeLessThanOrEqual(5);
  });

  it('prices the exchange as one decision, not two', () => {
    const plan = planNetwork(
      { ...options, colonies: overSupplied, prices: P2_ONLY, allowMarketSourcing: true },
      pi
    );
    for (const entry of plan.conversions) {
      expect(entry.netPerHour).toBeCloseTo(entry.add.marginPerHour - entry.removeMarginPerHour, 6);
      expect(entry.netPerHour).toBeGreaterThan(0);
    }
  });

  it('says nothing when the existing factories earn more than anything else would', () => {
    const precious = overSupplied.map((entry, i) =>
      i === 1 ? { ...entry, convertible: [convertible(REACTIVE_METALS, 8, 10_000_000)] } : entry
    );
    const plan = planNetwork(
      { ...options, colonies: precious, prices: P2_ONLY, allowMarketSourcing: true },
      pi
    );
    expect(plan.conversions).toEqual([]);
  });

  it('has nothing to convert on a colony that never declared any', () => {
    const plan = planNetwork({ ...options, prices: P2_ONLY, allowMarketSourcing: true }, pi);
    expect(plan.conversions).toEqual([]);
  });

  it('does not spend the freed budget twice', () => {
    const plan = planNetwork(
      { ...options, colonies: overSupplied, prices: P2_ONLY, allowMarketSourcing: true },
      pi
    );
    const host = overSupplied[1];
    const spent = plan.conversions
      .filter((entry) => entry.planetId === host.planetId)
      .reduce((sum, entry) => sum + entry.add.factories, 0);
    const freed = plan.conversions
      .filter((entry) => entry.planetId === host.planetId)
      .reduce((sum, entry) => sum + entry.removeCount, 0);
    const advanced = pi.infrastructure.pins.advanced;
    const basic = pi.infrastructure.pins.basic;
    const budget = host.spare.powergrid + (basic?.powergrid ?? 0) * freed;
    expect(spent * (advanced?.powergrid ?? 0)).toBeLessThanOrEqual(budget);
  });

  it('takes the removed factories’ own output off the pool with them', () => {
    const plan = planNetwork(
      { ...options, colonies: overSupplied, prices: P2_ONLY, allowMarketSourcing: true },
      pi
    );
    const removed = plan.conversions
      .filter((entry) => entry.removeName === 'Reactive Metals')
      .reduce((sum, entry) => sum + entry.removeCount * 40, 0);
    const routed = [...plan.opportunities, ...plan.conversions.map((entry) => entry.add)]
      .flatMap((line) => line.inputs)
      .filter((input) => input.typeId === REACTIVE_METALS && input.source !== 'bought')
      .reduce((sum, input) => sum + input.unitsPerHour, 0);
    const stillListed =
      plan.unallocated.find((line) => line.typeId === REACTIVE_METALS)?.unitsPerHour ?? 0;
    expect(routed + stillListed + removed).toBeLessThanOrEqual(320 + 1e-6);
  });
});

describe('planNetwork across systems', () => {
  const SPLIT: NetworkColony[] = EFA.map((colony, i) => ({
    ...colony,
    taxRate: i < 2 ? 0.2 : 0,
  }));

  it('puts the factories behind the kinder customs office', () => {
    const plan = planNetwork({ ...options, colonies: SPLIT }, pi);
    expect(plan.opportunities.length).toBeGreaterThan(0);
    const cheap = SPLIT.filter((colony) => colony.taxRate === 0).map((c) => c.planetId);
    for (const line of plan.opportunities) {
      expect(cheap).toContain(line.hostPlanetId);
    }
  });

  it('prices a line at its host’s rate, not the set’s best', () => {
    const dear = EFA.map((colony) => ({ ...colony, taxRate: 0.2 }));
    const free = EFA.map((colony) => ({ ...colony, taxRate: 0 }));
    const taxed = planNetwork({ ...options, colonies: dear }, pi);
    const untaxed = planNetwork({ ...options, colonies: free }, pi);
    const best = (plan: typeof taxed) =>
      plan.opportunities.find((line) => line.name === 'Superconductors');
    expect(best(taxed)?.marginPerUnit).toBeLessThan(best(untaxed)?.marginPerUnit ?? 0);
  });

  it('falls back to the shared rate for a colony that carries none', () => {
    const plan = planNetwork({ ...options, taxRate: 0.1 }, pi);
    const withRates = planNetwork(
      {
        ...options,
        taxRate: 0.9,
        colonies: EFA.map((colony) => ({ ...colony, taxRate: 0.1 })),
      },
      pi
    );
    expect(plan.opportunities.map((line) => line.name)).toEqual(
      withRates.opportunities.map((line) => line.name)
    );
  });

  it('says a product is unprofitable rather than unhosted when there is room but no margin', () => {
    const gouged = EFA.map((colony) => ({ ...colony, taxRate: 0.9 }));
    const plan = planNetwork({ ...options, colonies: gouged }, pi);
    expect(plan.opportunities).toEqual([]);
    expect(plan.blocked.some((line) => line.reason === 'unprofitable')).toBe(true);
    expect(plan.blocked.every((line) => line.reason !== 'no-host-budget')).toBe(true);
  });
});

describe('planNetwork — sourced material pricing', () => {
  it('prices a self-supplied input at the bid, never the ask, even split across colonies', () => {
    const twoColonies: NetworkColony[] = [colony(1, PLASMOIDS, 1_000), colony(2, WATER, 1_000)];
    const prices = { ...PRICES };
    const revenuePrices: Record<number, number> = { ...PRICES, [WATER]: 100 };
    const plan = planNetwork(
      {
        colonies: twoColonies,
        infrastructure: pi.infrastructure,
        prices,
        revenuePrices,
        taxRate: 0,
        salesTaxPct: 0,
      },
      pi
    );
    const superconductors = plan.opportunities.find((line) => line.name === 'Superconductors');
    expect(superconductors).toBeDefined();
    const expectedMarginPerUnit =
      revenuePrices[SUPERCONDUCTORS] - 8 * revenuePrices[PLASMOIDS] - 8 * revenuePrices[WATER];
    expect(superconductors?.marginPerUnit).toBeCloseTo(expectedMarginPerUnit, 6);
  });
});
