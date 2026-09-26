import { describe, expect, it } from 'vitest';
import {
  boosterReloadShortfall,
  capacitorBudget,
  capacitorStatusAtDrain,
  reloadDuty,
  sustainedRepair,
  type CapacitorUser,
  type Repairer,
} from './tank';

describe('reloadDuty', () => {
  it('is the share of the time a magazine keeps the module running, reloads counted', () => {
    // Three 12 s cycles, then a 10 s reload: 36 of every 46 s.
    expect(reloadDuty({ cycles: 3, cycleSeconds: 12, reloadSeconds: 10 })).toBeCloseTo(36 / 46, 9);
  });

  it('is 1 with no magazine, or one too small for a whole cycle', () => {
    expect(reloadDuty(undefined)).toBe(1);
    expect(reloadDuty({ cycles: 0, cycleSeconds: 12, reloadSeconds: 10 })).toBe(1);
  });
});

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

  it('averages a cap booster over its reload, as an ancillary repairer is', () => {
    // Medium Capacitor Booster II, Navy Cap Booster 400: three 400 GJ charges
    // 12 s apart, then 10 s reloading — 1200 GJ every 46 s, not 400 every 12.
    const magazine = { cycles: 3, cycleSeconds: 12, reloadSeconds: 10 };
    const budget = capacitorBudget(
      [{ capPerSecond: 20 }, { capPerSecond: -400 / 12, injectionPerCharge: 400, magazine }],
      30
    );
    expect(budget.boosterInjection).toBeCloseTo(1200 / 46, 6);
    expect(budget.delta).toBeCloseTo(30 + 1200 / 46 - 20, 6);
  });

  it('keeps the charge interval to hold peak an average that counts reloads in', () => {
    const magazine = { cycles: 3, cycleSeconds: 12, reloadSeconds: 10 };
    const budget = capacitorBudget(
      [{ capPerSecond: 60 }, { capPerSecond: -400 / 12, injectionPerCharge: 400, magazine }],
      40
    );
    // Still 20 GJ/s short without it: one 400 GJ charge per 20 s on average.
    expect(budget.secondsPerBoosterCharge).toBeCloseTo(20, 6);
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

describe('boosterReloadShortfall', () => {
  it('is the injection a reloading cap booster loses against the engine’s no-reload rate', () => {
    const magazine = { cycles: 3, cycleSeconds: 12, reloadSeconds: 10 };
    expect(
      boosterReloadShortfall([
        { capPerSecond: 20 },
        { capPerSecond: -400 / 12, injectionPerCharge: 400, magazine },
        { capPerSecond: -7.2 },
      ])
    ).toBeCloseTo(400 / 12 - 1200 / 46, 6);
  });

  it('is 0 with no cap booster, or one without a magazine', () => {
    expect(boosterReloadShortfall([{ capPerSecond: -7.2 }])).toBe(0);
    expect(boosterReloadShortfall([{ capPerSecond: -400 / 12, injectionPerCharge: 400 }])).toBe(0);
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

describe('capacitorStatusAtDrain', () => {
  // 1000 GJ, 200 s recharge: peak recharge 2.5 × 1000 / 200 = 12.5 GJ/s at 25%.
  const capacity = 1000;
  const recharge = 200;

  it('settles where the recharge curve meets a drain it can carry', () => {
    // 10(√s − s)·C/τ = D → √s = (1 + √(1 − 4D·τ/10C)) / 2.
    const status = capacitorStatusAtDrain(capacity, recharge, 10);
    const root = (1 + Math.sqrt(1 - (4 * 10 * recharge) / (10 * capacity))) / 2;
    expect(status).toEqual({
      stable: true,
      stablePercentage: expect.closeTo(root * root * 100, 6),
    });
  });

  it('is stable at 100% with no net drain, and exactly at 25% at peak', () => {
    expect(capacitorStatusAtDrain(capacity, recharge, -5)).toEqual({
      stable: true,
      stablePercentage: 100,
    });
    expect(capacitorStatusAtDrain(capacity, recharge, 12.5)).toEqual({
      stable: true,
      stablePercentage: expect.closeTo(25, 6),
    });
  });

  it('runs dry past peak, in the time the recharge curve buys from full', () => {
    const status = capacitorStatusAtDrain(capacity, recharge, 20);
    // Numerical check of ∫₀¹ C ds / (D − 10C/τ·(√s − s)).
    let seconds = 0;
    const steps = 200000;
    for (let i = 0; i < steps; i++) {
      const s = (i + 0.5) / steps;
      seconds += capacity / steps / (20 - ((10 * capacity) / recharge) * (Math.sqrt(s) - s));
    }
    expect(status.stable).toBe(false);
    expect(!status.stable && status.depletesInSeconds).toBeCloseTo(seconds, 2);
  });

  it('is capacity over drain when recharge barely matters', () => {
    const status = capacitorStatusAtDrain(capacity, recharge, 10000);
    expect(!status.stable && status.depletesInSeconds).toBeCloseTo(capacity / 10000, 3);
  });
});
