import { describe, expect, it } from 'vitest';
import {
  ABYSSAL_RUN_MINUTES,
  ABYSSAL_TIERS,
  abyssalActivation,
  abyssalFilamentCost,
  abyssalFilamentTypeId,
  abyssalHullRule,
  abyssalTierLevels,
  abyssalTiersRolling,
  weaponReachChange,
} from './abyssalRun';
import { ABYSSAL_WEATHER_KINDS } from './abyssalWeather';
import type { FittingStats } from './types';

describe('abyssalTierLevels', () => {
  it('rolls 30 or 50 percent weather through T3, 50 or 70 from T4', () => {
    expect(abyssalTierLevels(0)).toEqual([1, 2]);
    expect(abyssalTierLevels(3)).toEqual([1, 2]);
    expect(abyssalTierLevels(4)).toEqual([2, 3]);
    expect(abyssalTierLevels(6)).toEqual([2, 3]);
  });
});

describe('abyssalTiersRolling', () => {
  it('names the tiers that roll a strength, lowest first', () => {
    expect(abyssalTiersRolling(1)).toEqual([0, 1, 2, 3]);
    expect(abyssalTiersRolling(2)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(abyssalTiersRolling(3)).toEqual([4, 5, 6]);
  });
});

describe('abyssalFilamentTypeId', () => {
  it('names the filament by tier and weather', () => {
    expect(abyssalFilamentTypeId(1, 'exotic')).toBe(47761);
    expect(abyssalFilamentTypeId(1, 'electrical')).toBe(47765);
    expect(abyssalFilamentTypeId(0, 'gamma')).toBe(56136);
    expect(abyssalFilamentTypeId(6, 'firestorm')).toBe(56142);
    expect(abyssalFilamentTypeId(5, 'electrical')).toBe(47907);
  });
  it('has 35 distinct filaments', () => {
    const ids = ABYSSAL_TIERS.flatMap((tier) =>
      ABYSSAL_WEATHER_KINDS.map((kind) => abyssalFilamentTypeId(tier, kind))
    );
    expect(new Set(ids).size).toBe(35);
  });
});

describe('abyssalHullRule', () => {
  it('lets a cruiser go alone', () => {
    expect(abyssalHullRule(26)).toEqual({
      eligible: true,
      shipClass: 'cruiser',
      ships: 1,
      confirmed: true,
    });
    expect(abyssalHullRule(358)).toMatchObject({ shipClass: 'cruiser' }); // heavy assault
  });
  it('bars Tech 3 cruisers', () => {
    expect(abyssalHullRule(963)).toEqual({ eligible: false, reason: 'tech3Cruiser' });
  });
  it('sends destroyers in pairs, Tech 3 destroyers included', () => {
    expect(abyssalHullRule(420)).toEqual({
      eligible: true,
      shipClass: 'destroyer',
      ships: 2,
      confirmed: true,
    });
    expect(abyssalHullRule(1305)).toMatchObject({ shipClass: 'destroyer', confirmed: true });
  });
  it('counts Interdictors and Command Destroyers as destroyers, unconfirmed', () => {
    expect(abyssalHullRule(541)).toMatchObject({ shipClass: 'destroyer', confirmed: false });
    expect(abyssalHullRule(1534)).toMatchObject({ shipClass: 'destroyer', confirmed: false });
  });
  it('sends frigates in threes', () => {
    expect(abyssalHullRule(25)).toEqual({
      eligible: true,
      shipClass: 'frigate',
      ships: 3,
      confirmed: true,
    });
    expect(abyssalHullRule(831)).toMatchObject({ shipClass: 'frigate' });
  });
  it('turns away anything bigger, and says so for a group it has no rule for', () => {
    expect(abyssalHullRule(419)).toEqual({ eligible: false, reason: 'tooLarge' });
    expect(abyssalHullRule(27)).toEqual({ eligible: false, reason: 'tooLarge' });
    expect(abyssalHullRule(902)).toEqual({ eligible: false, reason: 'tooLarge' }); // jump freighter
    expect(abyssalHullRule(31)).toEqual({ eligible: false, reason: 'unlisted' });
    expect(abyssalHullRule(237)).toEqual({ eligible: false, reason: 'unlisted' }); // rookie ship
    expect(abyssalHullRule(1972)).toEqual({ eligible: false, reason: 'unlisted' }); // flag cruiser
    expect(abyssalHullRule(undefined)).toEqual({ eligible: false, reason: 'unlisted' });
  });
});

describe('abyssalActivation', () => {
  it('lets only T0 in at 1.0 and 0.9', () => {
    expect(abyssalActivation(0, 10)).toBe('clear');
    expect(abyssalActivation(1, 10)).toBe('blocked');
    expect(abyssalActivation(6, 9)).toBe('blocked');
  });
  it('flags a suspect from T4 at 0.8, T5 at 0.7, T6 at 0.6, nobody at 0.5', () => {
    expect(abyssalActivation(3, 8)).toBe('clear');
    expect(abyssalActivation(4, 8)).toBe('suspect');
    expect(abyssalActivation(4, 7)).toBe('clear');
    expect(abyssalActivation(5, 7)).toBe('suspect');
    expect(abyssalActivation(5, 6)).toBe('clear');
    expect(abyssalActivation(6, 6)).toBe('suspect');
    expect(abyssalActivation(6, 5)).toBe('clear');
  });
  it('flags no one below 0.5, where nothing polices the trace', () => {
    expect(abyssalActivation(6, 0)).toBe('unpoliced');
    expect(abyssalActivation(0, 0)).toBe('unpoliced');
  });
});

it('gives a run twenty minutes', () => {
  expect(ABYSSAL_RUN_MINUTES).toBe(20);
});

describe('weaponReachChange', () => {
  const stats = (weapons: object[]) => ({ offense: { weapons } }) as unknown as FittingStats;
  const turret = (typeId: number, optimal: number, falloff: number) => ({
    typeId,
    chargeTypeId: 1,
    isDrone: false,
    range: { optimal, falloff },
  });
  it('picks the longest-reaching weapon whose reach the weather moved', () => {
    const launcher = { typeId: 9, isDrone: false, range: { optimal: 60000, falloff: 0 } };
    expect(
      weaponReachChange(
        stats([launcher, turret(1, 5000, 8000), turret(2, 12000, 2000)]),
        stats([launcher, turret(1, 2500, 4000), turret(2, 6000, 1000)])
      )
    ).toEqual({
      typeId: 2,
      before: { optimal: 12000, falloff: 2000 },
      after: { optimal: 6000, falloff: 1000 },
    });
  });
  it('notices a falloff-only change', () => {
    expect(
      weaponReachChange(stats([turret(1, 5000, 8000)]), stats([turret(1, 5000, 4000)]))
    ).toMatchObject({ typeId: 1, after: { falloff: 4000 } });
  });
  it('is null when no reach moved, and skips drones', () => {
    const drone = { typeId: 3, isDrone: true, range: { optimal: 9000, falloff: 0 } };
    const droneAfter = { ...drone, range: { optimal: 4000, falloff: 0 } };
    expect(
      weaponReachChange(
        stats([drone, turret(1, 5000, 8000)]),
        stats([droneAfter, turret(1, 5000, 8000)])
      )
    ).toBeNull();
  });
});

describe('abyssalFilamentCost', () => {
  const FIL = 47905;
  it('prices every filament the hull needs when the cargo holds none', () => {
    expect(abyssalFilamentCost(3, FIL, 1_000_000, [])).toEqual({
      kind: 'priced',
      count: 3,
      inCargo: 0,
      total: 3_000_000,
    });
    expect(abyssalFilamentCost(1, FIL, 250_000, [])).toMatchObject({ count: 1, total: 250_000 });
  });
  it('prices only the shortfall and reports what the cargo covers', () => {
    expect(abyssalFilamentCost(3, FIL, 1_000_000, [{ typeId: FIL, quantity: 1 }])).toEqual({
      kind: 'priced',
      count: 2,
      inCargo: 1,
      total: 2_000_000,
    });
  });
  it('sums split stacks of the same type', () => {
    expect(
      abyssalFilamentCost(3, FIL, 10, [
        { typeId: FIL, quantity: 1 },
        { typeId: FIL, quantity: 1 },
      ])
    ).toMatchObject({ count: 1, inCargo: 2, total: 10 });
  });
  it('is covered, with no ISK, once the cargo holds enough', () => {
    expect(abyssalFilamentCost(2, FIL, 5, [{ typeId: FIL, quantity: 5 }])).toEqual({
      kind: 'covered',
    });
    expect(abyssalFilamentCost(2, FIL, null, [{ typeId: FIL, quantity: 2 }])).toEqual({
      kind: 'covered',
    });
  });
  it('ignores other filament types in the cargo', () => {
    expect(abyssalFilamentCost(2, FIL, 7, [{ typeId: 47904, quantity: 9 }])).toMatchObject({
      count: 2,
      inCargo: 0,
      total: 14,
    });
  });
  it('is null when the hub has no price and the cargo does not cover it', () => {
    expect(abyssalFilamentCost(2, FIL, null, [])).toBeNull();
    expect(abyssalFilamentCost(2, FIL, 0, [])).toBeNull();
  });
});
