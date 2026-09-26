import { describe, expect, it } from 'vitest';
import { capacitorBudget, sustainedRepair, type CapacitorUser, type Repairer } from './tank';

describe('capacitorBudget', () => {
  const users: CapacitorUser[] = [
    // A shield booster: 60 GJ every 3 s.
    { capPerSecond: 20 },
    // A cap booster: no activation cost, 400 GJ every 12 s.
    { capPerSecond: -400 / 12, injectionPerCharge: 400 },
    // A nosferatu: the engine reports what it takes as a negative draw.
    { capPerSecond: -7.2 },
    { capPerSecond: 9.375 },
  ];

  it('splits the peak load into drain, booster injection and nosferatu gain, and the delta', () => {
    const budget = capacitorBudget(users, 35.84);

    expect(budget.peakRecharge).toBeCloseTo(35.84, 6);
    expect(budget.drain).toBeCloseTo(29.375, 6);
    expect(budget.boosterInjection).toBeCloseTo(33.333, 3);
    expect(budget.nosferatuGain).toBeCloseTo(7.2, 6);
    // Recharge + booster + nos − drain.
    expect(budget.delta).toBeCloseTo(35.84 + 33.333 + 7.2 - 29.375, 3);
  });

  it('says how often a cap booster must inject to hold peak when the rest runs the cap dry', () => {
    const budget = capacitorBudget(
      [{ capPerSecond: 60 }, { capPerSecond: -400 / 12, injectionPerCharge: 400 }],
      40
    );
    // 20 GJ/s short without the booster; a 400 GJ charge covers 20 s of it.
    expect(budget.secondsPerBoosterCharge).toBeCloseTo(20, 6);
  });

  it('needs no booster charges when recharge alone keeps up, or when no booster is fitted', () => {
    expect(capacitorBudget([{ capPerSecond: 10 }], 40).secondsPerBoosterCharge).toBeNull();
    expect(
      capacitorBudget([{ capPerSecond: 10 }, { capPerSecond: -10, injectionPerCharge: 400 }], 40)
        .secondsPerBoosterCharge
    ).toBeNull();
    expect(capacitorBudget([{ capPerSecond: 60 }], 40).secondsPerBoosterCharge).toBeNull();
  });

  it('takes the biggest charge loaded when several boosters carry different ones', () => {
    const budget = capacitorBudget(
      [
        { capPerSecond: 80 },
        { capPerSecond: -150 / 12, injectionPerCharge: 150 },
        { capPerSecond: -400 / 12, injectionPerCharge: 400 },
      ],
      40
    );
    expect(budget.secondsPerBoosterCharge).toBeCloseTo(10, 6);
  });

  it('counts an ancillary shield booster running on its charges as drawing nothing, not injecting', () => {
    const budget = capacitorBudget([{ capPerSecond: 0, injectionPerCharge: 150 }], 40);
    expect(budget.boosterInjection).toBe(0);
    expect(budget.drain).toBe(0);
    expect(budget.secondsPerBoosterCharge).toBeNull();
  });

  it('has a zero delta percentage for a ship with no capacitor to recharge', () => {
    expect(capacitorBudget([], 0).deltaPct).toBe(0);
  });

  it('gives the delta as a share of peak recharge', () => {
    expect(capacitorBudget([{ capPerSecond: 30 }], 40).deltaPct).toBeCloseTo(25, 6);
  });
});

describe('sustainedRepair', () => {
  const booster: Repairer = { layer: 'shield', rate: 40, capPerSecond: 20 };
  const armorRep: Repairer = { layer: 'armor', rate: 30, capPerSecond: 10 };

  it('holds burst when the capacitor keeps up with everything', () => {
    const result = sustainedRepair([booster, armorRep], { peakRecharge: 50, peakLoad: 30 });

    expect(result.sustained).toEqual({ shield: 40, armor: 30, hull: 0 });
    expect(result.capFraction).toBe(1);
  });

  it('scales only the capacitor-using repairers by the share of their draw the capacitor can feed', () => {
    // 20 GJ/s go to other modules; 30 GJ/s of recharge is left for 30 GJ/s of reps... minus 10.
    const loaded: Repairer = { layer: 'shield', rate: 25, capPerSecond: 0 };
    const result = sustainedRepair([booster, armorRep, loaded], {
      peakRecharge: 30,
      peakLoad: 50,
    });

    // Non-rep load 20; 10 GJ/s left for 30 GJ/s of rep draw → a third.
    expect(result.capFraction).toBeCloseTo(1 / 3, 6);
    expect(result.sustained.shield).toBeCloseTo(40 / 3 + 25, 6);
    expect(result.sustained.armor).toBeCloseTo(10, 6);
  });

  it('runs no capacitor-using rep at all when the other modules already take all the recharge', () => {
    const result = sustainedRepair([booster], { peakRecharge: 10, peakLoad: 50 });
    expect(result.capFraction).toBe(0);
    expect(result.sustained.shield).toBe(0);
  });

  it('spreads a loaded ancillary repairer over its reload', () => {
    // Eight 12 s cycles of paste, then a 60 s reload: 96 of every 156 s.
    const aar: Repairer = {
      layer: 'armor',
      rate: 78,
      capPerSecond: 0,
      ancillary: { cycles: 8, cycleSeconds: 12, reloadSeconds: 60 },
    };
    const result = sustainedRepair([aar], { peakRecharge: 30, peakLoad: 0 });
    expect(result.sustained.armor).toBeCloseTo((78 * 96) / 156, 6);
  });

  it('treats an ancillary repairer with no whole cycle of charge as never reloading', () => {
    const aar: Repairer = {
      layer: 'armor',
      rate: 26,
      capPerSecond: 0,
      ancillary: { cycles: 0, cycleSeconds: 12, reloadSeconds: 60 },
    };
    expect(sustainedRepair([aar], { peakRecharge: 30, peakLoad: 0 }).sustained.armor).toBe(26);
  });
});
