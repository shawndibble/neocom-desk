import { describe, expect, it } from 'vitest';
import {
  MINING_ATTRIBUTE as A,
  extractCrystalFigures,
  extractMining,
  holdFillSeconds,
  miningYield,
} from './mining';

describe('miningYield', () => {
  it('gives each miner its m³ a second, crits expected in, and the residue it wastes', () => {
    const stats = miningYield([
      {
        typeId: 17912,
        chargeTypeId: 60281,
        isDrone: false,
        quantity: 2,
        amount: 550,
        cycleSeconds: 32.5,
        wasteChance: 0.376,
        wasteMultiplier: 1,
        critChance: 0.01,
        critBonus: 2,
      },
    ]);

    const perCycle = 550 * 2 * (1 + 0.01 * 2);
    expect(stats.rows).toEqual([
      {
        typeId: 17912,
        chargeTypeId: 60281,
        isDrone: false,
        count: 2,
        perCycle,
        cycleSeconds: 32.5,
        perSecond: perCycle / 32.5,
        wastePerSecond: (550 * 2 * 0.376) / 32.5,
      },
    ]);
    expect(stats.perSecond).toBeCloseTo(perCycle / 32.5, 9);
    expect(stats.perHour).toBeCloseTo((perCycle / 32.5) * 3600, 6);
  });

  it('adds mining drones to the modules and gives the waste as a share of the yield', () => {
    const stats = miningYield([
      {
        typeId: 1,
        isDrone: false,
        quantity: 1,
        amount: 100,
        cycleSeconds: 10,
        wasteChance: 0,
        wasteMultiplier: 1,
        critChance: 0,
        critBonus: 0,
      },
      {
        typeId: 2,
        isDrone: true,
        quantity: 5,
        amount: 60,
        cycleSeconds: 60,
        wasteChance: 0.5,
        wasteMultiplier: 1,
        critChance: 0,
        critBonus: 0,
      },
    ]);
    expect(stats.perSecond).toBeCloseTo(10 + 5, 9);
    expect(stats.wastePerSecond).toBeCloseTo(2.5, 9);
    expect(stats.wastePct).toBeCloseTo((2.5 / 15) * 100, 9);
  });

  it('has nothing to say for a fit with no miners', () => {
    expect(miningYield([])).toEqual({
      rows: [],
      perSecond: 0,
      perHour: 0,
      wastePerSecond: 0,
      wastePct: 0,
    });
  });
});

describe('holdFillSeconds', () => {
  it('is the hold over the yield, and nothing when there is no yield or hold', () => {
    expect(holdFillSeconds(28000, 60)).toBeCloseTo(466.67, 2);
    expect(holdFillSeconds(28000, 0)).toBeNull();
    expect(holdFillSeconds(0, 60)).toBeNull();
  });
});

describe('extractMining', () => {
  const attrs = (entries: Record<number, number>) =>
    new Map(Object.entries(entries).map(([id, value]) => [Number(id), { value }]));
  const miner = attrs({
    [A.miningAmount]: 550,
    [A.duration]: 32500,
    [A.wasteProbability]: 37.6,
    [A.wasteMultiplier]: 1,
    [A.critChance]: 0.01,
    [A.critBonus]: 2,
  });

  it('reads running miners (with their crystal) and launched mining drones, grouping identical ones', () => {
    const inputs = extractMining(
      [
        { type_id: 17912, slot: { type: 'high' }, state: 'active', charge: { type_id: 60281 } },
        { type_id: 17912, slot: { type: 'high' }, state: 'active', charge: { type_id: 60281 } },
        { type_id: 17912, slot: { type: 'high' }, state: 'online' },
        { type_id: 10250, slot: { type: 'drone_bay' }, state: 'active', quantity: 5 },
        { type_id: 10250, slot: { type: 'drone_bay' }, state: 'offline', quantity: 3 },
      ],
      [
        { attributes: miner, state: 'active' },
        { attributes: miner, state: 'active' },
        { attributes: miner, state: 'online' },
        { attributes: attrs({ [A.miningAmount]: 61.9, [A.duration]: 60000 }), state: 'active' },
        { attributes: attrs({ [A.miningAmount]: 61.9, [A.duration]: 60000 }), state: 'active' },
      ]
    );
    expect(inputs).toEqual([
      {
        typeId: 17912,
        chargeTypeId: 60281,
        isDrone: false,
        quantity: 2,
        amount: 550,
        cycleSeconds: 32.5,
        wasteChance: 0.376,
        wasteMultiplier: 1,
        critChance: 0.01,
        critBonus: 2,
      },
      {
        typeId: 10250,
        isDrone: true,
        quantity: 5,
        amount: 61.9,
        cycleSeconds: 60,
        wasteChance: 0,
        wasteMultiplier: 1,
        critChance: 0,
        critBonus: 0,
      },
    ]);
  });
});

describe('extractCrystalFigures', () => {
  const attributes = (values: Record<number, number>) =>
    new Map(Object.entries(values).map(([id, value]) => [Number(id), { value }]));
  const strip = (charge: number, amount: number, ms: number, waste: number, mult: number) => ({
    item: { type_id: 17912, slot: { type: 'high' }, state: 'active', charge: { type_id: charge } },
    result: {
      state: 'active',
      attributes: attributes({
        [A.miningAmount]: amount,
        [A.duration]: ms,
        [A.wasteProbability]: waste,
        [A.wasteMultiplier]: mult,
        [A.critChance]: 0.01,
        [A.critBonus]: 2,
      }),
    },
  });

  it("gives a miner group's yield, cycle and residue with a crystal in every one", () => {
    // Two strip miners with Simple C II, a drone that must not count.
    const fit = [
      strip(60284, 26.2, 37102, 93, 29),
      {
        item: { type_id: 2, slot: { type: 'drone_bay' }, state: 'active' },
        result: strip(0, 50, 60000, 0, 1).result,
      },
      strip(60284, 26.2, 37102, 93, 29),
    ];
    const figures = extractCrystalFigures(
      fit.map((f) => f.item),
      fit.map((f) => f.result),
      [0, 2]
    );
    const perSecond = (2 * 26.2 * 1.02) / 37.102;
    const residue = (2 * 26.2 * 0.93 * 29) / 37.102;
    expect(figures?.m3PerSecond).toBeCloseTo(perSecond, 9);
    expect(figures?.cycleSeconds).toBeCloseTo(37.102, 9);
    expect(figures?.residueChance).toBeCloseTo(0.93, 9);
    expect(figures?.residueMultiplier).toBe(29);
    expect(figures?.residueM3s).toBeCloseTo(residue, 9);
    // What leaves the rock: the yield and the residue.
    expect(figures?.removedM3s).toBeCloseTo(perSecond + residue, 9);
  });

  it('is null for a group that mines nothing', () => {
    const fit = [strip(1, 0, 1000, 0, 1)];
    expect(
      extractCrystalFigures(
        fit.map((f) => f.item),
        fit.map((f) => f.result),
        [0]
      )
    ).toBeNull();
  });
});
