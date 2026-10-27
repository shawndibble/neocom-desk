import { describe, expect, it } from 'vitest';
import type { MutaplasmidData } from '@/sde/types';
import { newFitting } from './fittingEdit';
import { mutaplasmidLookup } from './mutaplasmids';
import type { Fitting } from './types';
import {
  clampRoll,
  groupMutaplasmidsByStrain,
  mutaplasmidStrain,
  rollAtQuality,
  rollRows,
  setModuleMutation,
  setModuleRoll,
  startingRolls,
} from './mutationEdit';

// Shapes from public/data/mutaplasmids.json: Gravid / Decayed Heavy Energy
// Neutralizer Mutaplasmid -> Heavy Abyssal Energy Neutralizer.
const GRAVID = 47831;
const DECAYED = 47829;
const ABYSSAL_NEUT = 47832;
const GREMLIN = 16475;
const NEUT_II = 12271;
const CAP_NEED = 6;
const POWER = 30;
const RANGE = 54;
const SIG = 552; // rolled, but the base carries none

const DATA: MutaplasmidData = {
  attributeNames: { 6: 'capacitorNeed', 30: 'power', 54: 'maxRange', 552: 'signatureRadius' },
  mutaplasmids: {
    [GRAVID]: {
      result: ABYSSAL_NEUT,
      bases: [NEUT_II, GREMLIN],
      attributes: [
        { id: CAP_NEED, min: 0.8, max: 1.3, highIsGood: false },
        { id: POWER, min: 0.85, max: 1.3, highIsGood: false },
        // A range that leaves ×1 out: a base value clamps to its edge.
        { id: RANGE, min: 1.05, max: 1.3, highIsGood: true },
        { id: SIG, min: 0.9, max: 1.1, highIsGood: false },
      ],
    },
    [DECAYED]: {
      result: ABYSSAL_NEUT,
      bases: [GREMLIN],
      attributes: [{ id: CAP_NEED, min: 0.85, max: 1.2, highIsGood: false }],
    },
  },
  abyssalTypeIds: [ABYSSAL_NEUT],
};
const lookup = mutaplasmidLookup(DATA);

const BASE: Record<number, number> = { [CAP_NEED]: 100, [POWER]: 1000, [RANGE]: 10000 };
const baseValue = (id: number) => BASE[id];

function fit(module: Fitting['modules'][number]): Fitting {
  return { ...newFitting(1, 'Test'), modules: [module] };
}

const plain = { slot: 'high', slotIndex: 0, typeId: NEUT_II, state: 'active' } as const;

describe('clampRoll', () => {
  it('keeps a value inside the range and pulls one outside to the nearer edge', () => {
    const range = { min: 80, max: 130, highIsGood: false };
    expect(clampRoll(100, range)).toBe(100);
    expect(clampRoll(10, range)).toBe(80);
    expect(clampRoll(500, range)).toBe(130);
  });
});

describe('rollAtQuality', () => {
  it('reads quality in the good direction: 1 is the best end', () => {
    const lowGood = { min: 80, max: 130, highIsGood: false };
    expect(rollAtQuality(1, lowGood)).toBe(80);
    expect(rollAtQuality(0, lowGood)).toBe(130);
    const highGood = { min: 80, max: 130, highIsGood: true };
    expect(rollAtQuality(1, highGood)).toBe(130);
    expect(rollAtQuality(0.5, highGood)).toBe(105);
  });

  it('clamps quality to 0..1', () => {
    const range = { min: 80, max: 130, highIsGood: true };
    expect(rollAtQuality(2, range)).toBe(130);
    expect(rollAtQuality(-1, range)).toBe(80);
  });
});

describe('startingRolls', () => {
  it("is the base's own value of each rolled attribute, clamped into its range", () => {
    expect(startingRolls(GRAVID, baseValue, lookup)).toEqual({
      [CAP_NEED]: 100,
      [POWER]: 1000,
      [RANGE]: 10500,
    });
  });

  it('leaves out an attribute the base does not carry, or carries as 0', () => {
    const rolls = startingRolls(GRAVID, (id) => (id === POWER ? 0 : BASE[id]), lookup);
    expect(rolls).not.toHaveProperty(String(POWER));
    expect(rolls).not.toHaveProperty(String(SIG));
  });

  it('is empty for an unknown mutaplasmid', () => {
    expect(startingRolls(999, baseValue, lookup)).toEqual({});
  });
});

describe('rollRows', () => {
  it('lists each rolled attribute the base carries, with its absolute range and quality', () => {
    const rows = rollRows(GRAVID, { [CAP_NEED]: 80 }, baseValue, lookup);
    expect(rows.map((r) => r.attributeId)).toEqual([CAP_NEED, POWER, RANGE]);
    expect(rows[0]).toEqual({
      attributeId: CAP_NEED,
      range: { min: 80, max: 130, highIsGood: false },
      value: 80,
      quality: 1,
      rolled: true,
    });
  });

  it('shows an attribute with no roll at its clamped base value, marked not rolled', () => {
    const rows = rollRows(GRAVID, {}, baseValue, lookup);
    const range = rows.find((r) => r.attributeId === RANGE)!;
    expect(range.value).toBe(10500);
    expect(range.rolled).toBe(false);
    expect(range.quality).toBeCloseTo(0);
  });
});

describe('setModuleMutation', () => {
  it('turns a base module into the abyssal type, with the given mutation', () => {
    const next = setModuleMutation(
      fit(plain),
      'high',
      0,
      { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: { [CAP_NEED]: 90 } },
      lookup
    );
    expect(next.modules[0]).toEqual({
      ...plain,
      typeId: ABYSSAL_NEUT,
      mutation: { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: { [CAP_NEED]: 90 } },
    });
  });

  it('drops rolls the mutaplasmid does not make', () => {
    const next = setModuleMutation(
      fit(plain),
      'high',
      0,
      { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: { [CAP_NEED]: 90, 9: 1 } },
      lookup
    );
    expect(next.modules[0]!.mutation!.attributes).toEqual({ [CAP_NEED]: 90 });
  });

  it('leaves the Fitting alone for a mutaplasmid that does not take that base', () => {
    const before = fit(plain);
    const next = setModuleMutation(
      before,
      'high',
      0,
      { baseTypeId: NEUT_II, mutaplasmidTypeId: DECAYED, attributes: {} },
      lookup
    );
    expect(next).toBe(before);
  });

  it('gives an abyssal module of unknown base its base and rolls', () => {
    const bare = { ...plain, typeId: ABYSSAL_NEUT };
    const next = setModuleMutation(
      fit(bare),
      'high',
      0,
      { baseTypeId: GREMLIN, mutaplasmidTypeId: DECAYED, attributes: { [CAP_NEED]: 100 } },
      lookup
    );
    expect(next.modules[0]!.typeId).toBe(ABYSSAL_NEUT);
    expect(next.modules[0]!.mutation!.baseTypeId).toBe(GREMLIN);
  });

  it('with null, reverts a mutated module to its base and keeps state and charge', () => {
    const mutated = {
      ...plain,
      state: 'overload' as const,
      chargeTypeId: 5,
      typeId: ABYSSAL_NEUT,
      mutation: { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: {} },
    };
    const next = setModuleMutation(fit(mutated), 'high', 0, null, lookup);
    expect(next.modules[0]).toEqual({ ...plain, state: 'overload', chargeTypeId: 5 });
  });

  it('with null, leaves a module with no mutation alone', () => {
    const before = fit({ ...plain, typeId: ABYSSAL_NEUT });
    expect(setModuleMutation(before, 'high', 0, null, lookup)).toBe(before);
  });
});

describe('setModuleRoll', () => {
  const mutated = {
    ...plain,
    typeId: ABYSSAL_NEUT,
    mutation: { baseTypeId: NEUT_II, mutaplasmidTypeId: GRAVID, attributes: {} },
  };

  it('sets one roll, clamped to its range, and fills the others from the base', () => {
    const next = setModuleRoll(fit(mutated), 'high', 0, CAP_NEED, 50, baseValue, lookup);
    expect(next.modules[0]!.mutation!.attributes).toEqual({
      [CAP_NEED]: 80,
      [POWER]: 1000,
      [RANGE]: 10500,
    });
  });

  it('keeps the rolls already set', () => {
    const rolled = { ...mutated, mutation: { ...mutated.mutation, attributes: { [POWER]: 900 } } };
    const next = setModuleRoll(fit(rolled), 'high', 0, CAP_NEED, 120, baseValue, lookup);
    expect(next.modules[0]!.mutation!.attributes).toMatchObject({ [POWER]: 900, [CAP_NEED]: 120 });
  });

  it('leaves a module with no mutation, or an attribute it does not roll, alone', () => {
    const before = fit(plain);
    expect(setModuleRoll(before, 'high', 0, CAP_NEED, 90, baseValue, lookup)).toBe(before);
    const other = fit(mutated);
    expect(setModuleRoll(other, 'high', 0, 9, 90, baseValue, lookup)).toBe(other);
  });
});

describe('mutaplasmidStrain', () => {
  it('reads the strain off the name', () => {
    expect(mutaplasmidStrain('Gravid Heavy Energy Neutralizer Mutaplasmid')).toBe('gravid');
    expect(mutaplasmidStrain('Glorified Decayed 50MN Microwarpdrive Mutaplasmid')).toBe(
      'glorified'
    );
    expect(mutaplasmidStrain("Exigent 'Excavator' Mining Drone Mutaplasmid")).toBe('exigent');
    expect(mutaplasmidStrain('Something New Mutaplasmid')).toBe('other');
  });
});

describe('groupMutaplasmidsByStrain', () => {
  it('groups in the strain order the game sorts by, names alphabetical within a group', () => {
    const names: Record<number, string> = {
      1: 'Unstable B Mutaplasmid',
      2: 'Decayed A Mutaplasmid',
      3: 'Glorified Decayed A Mutaplasmid',
      4: 'Decayed B Mutaplasmid',
      5: 'Odd Mutaplasmid',
    };
    const groups = groupMutaplasmidsByStrain([1, 2, 3, 4, 5], (id) => names[id]!);
    expect(groups).toEqual([
      { strain: 'decayed', typeIds: [2, 4] },
      { strain: 'unstable', typeIds: [1] },
      { strain: 'glorified', typeIds: [3] },
      { strain: 'other', typeIds: [5] },
    ]);
  });
});
