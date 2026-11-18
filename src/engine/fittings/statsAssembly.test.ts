import { describe, expect, it } from 'vitest';
import type { Calculation, Fit } from '@eveshipfit/dogma-engine';
import { assembleStats, type StatsAssemblyContext } from './statsAssembly';
import { ITEM_DOGMA_ATTRIBUTE, type Fitting } from './types';

type Attrs = Record<number, number>;
const attrMap = (values: Attrs) =>
  new Map(Object.entries(values).map(([id, value]) => [Number(id), { value, base: value }]));

function calc(items: Attrs[], ship: Attrs = {}): Calculation {
  return {
    ship: { attributes: attrMap(ship) },
    character: { attributes: attrMap({}) },
    items: items.map((attributes) => ({ state: 'active', attributes: attrMap(attributes) })),
  } as unknown as Calculation;
}

const fitting: Fitting = {
  shipTypeId: 1,
  name: '',
  modules: [],
  drones: [{ typeId: 50, quantity: 3, state: 'active' }],
  cargo: [],
} as unknown as Fitting;

const dogmaFit = {
  ship: { type_id: 1 },
  items: [
    { type_id: 10, slot: { type: 'rig', index: 0 }, state: 'online' },
    { type_id: 11, slot: { type: 'rig', index: 1 }, state: 'online' },
    { type_id: 50, slot: { type: 'drone_bay', index: 0 }, state: 'active', quantity: 3 },
    { type_id: 51, slot: { type: 'drone_bay', index: 1 }, state: 'online', quantity: 5 },
  ],
} as unknown as Fit;

function ctx(overrides: Partial<StatsAssemblyContext> = {}): StatsAssemblyContext {
  const calculation = calc([
    { [ITEM_DOGMA_ATTRIBUTE.calibrationCost]: 50 },
    { [ITEM_DOGMA_ATTRIBUTE.calibrationCost]: 25 },
    { [ITEM_DOGMA_ATTRIBUTE.droneBandwidthNeeded]: 10 },
    { [ITEM_DOGMA_ATTRIBUTE.droneBandwidthNeeded]: 10 },
  ]);
  return {
    fitting,
    dogmaFit,
    calculation,
    shown: calculation,
    beside: null,
    harmlessCharges: new Set(),
    ruleBreaks: [],
    covertCloaks: new Set(),
    ...overrides,
  };
}

describe('assembleStats', () => {
  it('sums calibration over rigs', () => {
    expect(assembleStats(ctx()).calibrationUsed).toBe(75);
  });

  it('counts drone bandwidth only for deployed stacks, times quantity', () => {
    expect(assembleStats(ctx()).droneBandwidthUsed).toBe(30);
  });

  it('reads the sums off shown, not calculation', () => {
    const shown = calc([{ [ITEM_DOGMA_ATTRIBUTE.calibrationCost]: 1 }, {}, {}, {}]);
    expect(assembleStats(ctx({ shown })).calibrationUsed).toBe(1);
  });

  it('passes rule breaks through', () => {
    const ruleBreaks = [{ kind: 'slots', slot: 'high', used: 9, available: 8 }] as never;
    expect(assembleStats(ctx({ ruleBreaks })).ruleBreaks).toBe(ruleBreaks);
  });

  it('has no overheated figures without a beside calculation', () => {
    expect(assembleStats(ctx()).overheated).toBeNull();
  });

  it('reports overheated figures when a beside calculation is given', () => {
    expect(assembleStats(ctx({ beside: calc([{}, {}, {}, {}]) })).overheated).not.toBeNull();
  });
});
