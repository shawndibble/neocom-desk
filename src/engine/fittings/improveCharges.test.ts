import { describe, expect, it } from 'vitest';
import type { ChargeChoice } from './chargeChoice';
import { loadBestCharges, unloadedWeapons, type ChargeGroup } from './improveCharges';
import type { Fitting, FittingModule } from './types';

const module = (slotIndex: number, typeId: number, chargeTypeId?: number): FittingModule => ({
  slot: 'high',
  slotIndex,
  typeId,
  state: 'active',
  ...(chargeTypeId !== undefined ? { chargeTypeId } : {}),
});

const choice = (typeId: number, patch: Partial<ChargeChoice> = {}): ChargeChoice => ({
  typeId,
  name: `Charge ${typeId}`,
  baseTypeId: typeId,
  baseName: `Charge ${typeId}`,
  tier: 'tech1',
  faction: null,
  dps: 100,
  optimal: 10_000,
  falloff: 0,
  damage: null,
  price: null,
  roundsPerMinute: null,
  cargo: 0,
  skillMissing: false,
  ...patch,
});

const fit = (modules: FittingModule[], cargo: Fitting['cargo'] = []): Fitting => ({
  name: 'Test',
  shipTypeId: 1,
  modules,
  drones: [],
  cargo,
});

const launchers = (choices: ChargeChoice[], patch: Partial<ChargeGroup> = {}): ChargeGroup => ({
  moduleTypeId: 500,
  isWeapon: true,
  choices,
  ...patch,
});

describe('unloadedWeapons', () => {
  it('counts weapons with no charge, by kind', () => {
    const f = fit([module(0, 500), module(1, 500), module(2, 500, 900)]);
    expect(unloadedWeapons(f, [launchers([choice(900)])])).toEqual({ count: 2, kind: 'launcher' });
  });

  it('is null when every weapon holds a charge', () => {
    const f = fit([module(0, 500, 900)]);
    expect(unloadedWeapons(f, [launchers([choice(900)])])).toBeNull();
  });

  it('ignores modules with no damaging charge (smartbombs, cap boosters)', () => {
    const f = fit([module(0, 600)]);
    expect(
      unloadedWeapons(f, [
        launchers([choice(901, { dps: 0 })], { moduleTypeId: 600, isWeapon: false }),
      ])
    ).toBeNull();
  });

  it('names turrets for guns with falloff, and weapons when mixed', () => {
    const gun = launchers([choice(901, { falloff: 5000 })], { moduleTypeId: 501 });
    expect(unloadedWeapons(fit([module(0, 501)]), [gun])?.kind).toBe('turret');
    expect(
      unloadedWeapons(fit([module(0, 501), module(1, 500)]), [gun, launchers([choice(900)])])?.kind
    ).toBe('weapon');
  });
});

describe('loadBestCharges', () => {
  it('prefers a charge already in cargo over the picker’s top pick', () => {
    const f = fit([module(0, 500)], [{ typeId: 901, quantity: 100 }]);
    const plan = loadBestCharges(f, [
      launchers([choice(900, { dps: 500 }), choice(901, { dps: 100, cargo: 100 })]),
    ]);
    expect(plan).toEqual([
      { chargeTypeId: 901, fromCargo: true, at: [{ slot: 'high', slotIndex: 0 }] },
    ]);
  });

  it('falls back to the most damaging charge, not from cargo', () => {
    const f = fit([module(0, 500), module(1, 500)]);
    const plan = loadBestCharges(f, [
      launchers([choice(900, { dps: 100 }), choice(901, { dps: 300 })]),
    ]);
    expect(plan).toEqual([
      {
        chargeTypeId: 901,
        fromCargo: false,
        at: [
          { slot: 'high', slotIndex: 0 },
          { slot: 'high', slotIndex: 1 },
        ],
      },
    ]);
  });

  it('skips charges the pilot lacks the skill for, and loaded modules', () => {
    const f = fit([module(0, 500, 900), module(1, 500)]);
    const plan = loadBestCharges(f, [
      launchers([choice(901, { dps: 900, skillMissing: true }), choice(902, { dps: 50 })]),
    ]);
    expect(plan).toEqual([
      { chargeTypeId: 902, fromCargo: false, at: [{ slot: 'high', slotIndex: 1 }] },
    ]);
  });

  it('plans nothing when no charge is usable', () => {
    const f = fit([module(0, 500)]);
    expect(loadBestCharges(f, [launchers([choice(901, { skillMissing: true })])])).toEqual([]);
  });
});
