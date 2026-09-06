import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import { planNetwork, type NetworkColony } from './network';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

/** The four P1s the reported operation makes, one per colony. */
const BACTERIA = 2393;
const REACTIVE_METALS = 2398;
const WATER = 3645;
const PLASMOIDS = 2389;
/** The four P2s those four combine into. */
const TEST_CULTURES = 2319;
const WATER_COOLED_CPU = 2328;
const NANITES = 2463;
const SUPERCONDUCTORS = 9838;

/** Jita sell, read 2026-09-06 — the prices the opportunity was found at. */
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

/** Room for plenty, so a test about supply is not silently about budget. */
const ROOMY = { cpu: 100_000, powergrid: 100_000 };

function colony(planetId: number, typeId: number, unitsPerHour: number): NetworkColony {
  return {
    planetId,
    outputPerHour: new Map([[typeId, unitsPerHour]]),
    spare: ROOMY,
    newLinkCost: { cpu: 30, powergrid: 21 },
  };
}

/** The reported operation: Efa II, IV, V and VI, at their measured P1 rates. */
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
  // Their system's own rate. Nothing here derives one.
  taxRate: 0,
};

describe('planNetwork', () => {
  it('finds the P2 two colonies can make that neither can make alone', () => {
    const plan = planNetwork(options, pi);
    const names = plan.opportunities.map((line) => line.name);
    // Every card in this system says "keep selling raw", because
    // `localChainTargets` gates on one planet's own P0 closure and no single
    // planet here reaches a P2. Together they reach four.
    expect(names).toContain('Superconductors');
    expect(names).toContain('Nanites');
  });

  it('ranks by what a factory earns, and spends the scarcest input on the best', () => {
    const plan = planNetwork(options, pi);
    // Per factory an hour, at these prices: Superconductors 11,836,
    // Test Cultures 9,844, Nanites 7,212, Water-Cooled CPU 1,756. Water feeds
    // three of the four and is the scarce one, so it goes to Superconductors
    // and the Bacteria/Reactive Metals pair is left for Nanites.
    expect(plan.opportunities[0].name).toBe('Superconductors');
    expect(plan.opportunities[0].marginPerHour).toBeGreaterThan(
      plan.opportunities[1].marginPerHour
    );
    const superconductors = plan.opportunities[0];
    // 226.69 Water an hour over 40 an hour a factory.
    expect(superconductors.factories).toBe(5);
    // Whole factories, so the answer is below the fractional bound: five
    // Superconductor factories at 11,836 and three Nanite ones at 7,212. The
    // 0.67 and 0.53 of a factory the material would also support cannot be
    // built, and are reported as leftover P1 rather than rounded into ISK.
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
    // Water is the input three of the four candidates want.
    expect(drawn.get(WATER) ?? 0).toBeLessThanOrEqual(226.69 + 1e-6);
    expect(drawn.get(BACTERIA) ?? 0).toBeLessThanOrEqual(141.34 + 1e-6);
  });

  it('names where every input comes from, and which are already on the host', () => {
    const plan = planNetwork(options, pi);
    const line = plan.opportunities[0];
    const sources = new Set(line.inputs.map((input) => input.fromPlanetId));
    expect(sources.size).toBe(2);
    expect(sources).toContain(line.hostPlanetId);
    // Exactly one input is imported; the other is made where the factories go.
    expect(line.inputs.filter((input) => input.local)).toHaveLength(1);
  });

  it('will not put factories on a colony that has no budget for them', () => {
    // Every colony full but one. An Advanced factory is 500 tf / 700 MW plus
    // its link, so only the roomy one can host — the same constraint the
    // "Room for" row states, applied a layer up.
    const tight = EFA.map((entry, i) =>
      i === 2 ? entry : { ...entry, spare: { cpu: 100, powergrid: 100 } }
    );
    const plan = planNetwork({ ...options, colonies: tight }, pi);
    for (const line of plan.opportunities) expect(line.hostPlanetId).toBe(40_246_354);
  });

  it('reports a candidate nothing can host rather than dropping it', () => {
    // "You need more powergrid for this" is the actionable half, and silence
    // reads as "there is nothing here".
    const full = EFA.map((entry) => ({ ...entry, spare: { cpu: 0, powergrid: 0 } }));
    const plan = planNetwork({ ...options, colonies: full }, pi);
    expect(plan.opportunities).toEqual([]);
    expect(plan.blocked.map((line) => line.name)).toContain('Superconductors');
    expect(plan.blocked.every((line) => line.reason === 'no-host-budget')).toBe(true);
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
    // That is the per-planet question `recommendStopTier` answers, and a
    // system panel repeating it would put the same advice on the card twice.
    const selfSufficient: NetworkColony[] = [
      {
        planetId: 1,
        outputPerHour: new Map([
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
    // Import onto the host is charged on half a P1's taxable value, export off
    // it on the P2's — `chain.ts`'s tables, not new arithmetic. At 10% the
    // margin has to fall.
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

  it('reports the P1 still worth selling raw, so the panel can say what is left over', () => {
    const plan = planNetwork(options, pi);
    // Plasmoids: 264.42/hr made, 5 factories x 40 = 200 consumed.
    const left = plan.unallocated.find((line) => line.typeId === PLASMOIDS);
    expect(left?.unitsPerHour).toBeCloseTo(64.42, 4);
  });

  it('has nothing to say about a single colony, or none', () => {
    expect(planNetwork({ ...options, colonies: [] }, pi).opportunities).toEqual([]);
    expect(planNetwork({ ...options, colonies: [EFA[0]] }, pi).opportunities).toEqual([]);
  });
});
