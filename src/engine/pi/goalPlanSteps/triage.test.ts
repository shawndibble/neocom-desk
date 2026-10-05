import { describe, it, expect } from 'vitest';
import { normaliseGoals, triageGoals } from './triage';
import {
  AQUEOUS_LIQUIDS,
  BASE_METALS,
  COOLANT,
  IONIC_SOLUTIONS,
  POLICY,
  REACTIVE_METALS,
  WATER,
  colony,
  goal,
  pi,
} from './test-helpers';

describe('normaliseGoals', () => {
  it('merges goals by type, drops zero rates, and sorts by type id', () => {
    expect(
      normaliseGoals(
        [
          { typeId: WATER, unitsPerDay: 24 },
          { typeId: REACTIVE_METALS, unitsPerDay: 0 },
          { typeId: COOLANT, unitsPerDay: 10 },
          { typeId: WATER, unitsPerDay: 48 },
        ],
        pi
      )
    ).toEqual([
      { typeId: WATER, unitsPerDay: 72 },
      { typeId: COOLANT, unitsPerDay: 10 },
    ]);
  });

  it('refuses a P0 goal and a rate that is negative or not finite', () => {
    expect(() => normaliseGoals([{ typeId: AQUEOUS_LIQUIDS, unitsPerDay: 1 }], pi)).toThrow(
      /is a P0/
    );
    expect(() => normaliseGoals([{ typeId: WATER, unitsPerDay: -1 }], pi)).toThrow(/finite/);
    expect(() => normaliseGoals([{ typeId: WATER, unitsPerDay: NaN }], pi)).toThrow(/finite/);
  });
});

describe('triageGoals', () => {
  it('blocks a goal whose P0 no colony yields, as a type gap in both P0 and P1 units', () => {
    const rm = goal(REACTIVE_METALS, 40);
    const result = triageGoals([rm], [colony(1, 'temperate')], POLICY, pi);
    expect(result.live).toEqual([]);
    expect(result.blocked).toEqual([rm]);
    expect(result.blockedBy.get(rm)).toEqual([BASE_METALS]);
    expect(result.typeGaps).toEqual([
      {
        kind: 'type-gap',
        p0TypeId: BASE_METALS,
        p1TypeId: REACTIVE_METALS,
        unitsPerHour: 6000,
        p1UnitsPerHour: 40,
        fixPlanetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
      },
    ]);
  });

  it('names only the missing input of a P2 whose other input is yieldable', () => {
    // Coolant is Water (Aqueous Liquids, Temperate has it) + Electrolytes (Ionic Solutions, it does not).
    const coolant = goal(COOLANT, 5);
    const result = triageGoals([coolant], [colony(1, 'temperate')], POLICY, pi);
    expect(result.blockedBy.get(coolant)).toEqual([IONIC_SOLUTIONS]);
    expect(result.typeGaps.map((g) => g.kind === 'type-gap' && g.p0TypeId)).toEqual([
      IONIC_SOLUTIONS,
    ]);
  });

  it('blocks nothing when the pilot buys P1: a missing P0 is bought as its P1', () => {
    const rm = goal(REACTIVE_METALS, 40);
    const result = triageGoals([rm], [colony(1, 'temperate')], { ...POLICY, buyTiers: [1] }, pi);
    expect(result.live).toEqual([rm]);
    expect(result.blocked).toEqual([]);
    expect(result.typeGaps).toEqual([]);
  });

  it('keeps a goal live when some colony yields every P0 it needs', () => {
    const rm = goal(REACTIVE_METALS, 40);
    const result = triageGoals([rm], [colony(1, 'temperate'), colony(2, 'barren')], POLICY, pi);
    expect(result.live).toEqual([rm]);
    expect(result.typeGaps).toEqual([]);
  });
});
