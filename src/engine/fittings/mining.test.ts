import { describe, expect, it } from 'vitest';
import { MINING_ATTRIBUTE as A, extractMining, holdFillSeconds, miningYield } from './mining';

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
