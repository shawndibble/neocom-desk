import { describe, expect, it } from 'vitest';
import type { MutaplasmidData } from '@/sde/types';
import type { Fitting } from './types';
import {
  hasMutations,
  mutaplasmidLookup,
  mutationFromDynamicItem,
  mutationStatus,
  normaliseFittingMutations,
  normaliseMutation,
  rollQuality,
  withoutMutation,
} from './mutaplasmids';

// Real ids and ranges from public/data/mutaplasmids.json (build 3607705):
// Gravid / Decayed Heavy Energy Neutralizer Mutaplasmid -> Heavy Abyssal
// Energy Neutralizer, from (among others) the Heavy Gremlin Compact.
const GRAVID_HEAVY_NEUT = 47831;
const DECAYED_HEAVY_NEUT = 47829;
const HEAVY_ABYSSAL_NEUT = 47832;
const HEAVY_GREMLIN_NEUT = 16475;
const HEAVY_NEUT_II = 12271;
const DAMAGE_CONTROL_II = 2048;
const EXIGENT_LIGHT_FIREPOWER = 60461;
const LIGHT_MUTATED_DRONE = 60478;
const HOBGOBLIN_I = 2454;

const DATA: MutaplasmidData = {
  attributeNames: {
    6: 'capacitorNeed',
    30: 'power',
    54: 'maxRange',
    97: 'energyNeutralizerAmount',
    64: 'damageMultiplier',
  },
  mutaplasmids: {
    [GRAVID_HEAVY_NEUT]: {
      result: HEAVY_ABYSSAL_NEUT,
      bases: [HEAVY_NEUT_II, HEAVY_GREMLIN_NEUT],
      attributes: [
        { id: 6, min: 0.8, max: 1.3, highIsGood: false },
        { id: 30, min: 0.85, max: 1.3, highIsGood: false },
        { id: 54, min: 0.8, max: 1.3, highIsGood: true },
        { id: 97, min: 0.9, max: 1.2, highIsGood: true },
      ],
    },
    [DECAYED_HEAVY_NEUT]: {
      result: HEAVY_ABYSSAL_NEUT,
      bases: [HEAVY_GREMLIN_NEUT],
      attributes: [{ id: 6, min: 0.85, max: 1.2, highIsGood: false }],
    },
    [EXIGENT_LIGHT_FIREPOWER]: {
      result: LIGHT_MUTATED_DRONE,
      bases: [HOBGOBLIN_I],
      attributes: [{ id: 64, min: 1, max: 1.2, highIsGood: true }],
    },
  },
  abyssalTypeIds: [HEAVY_ABYSSAL_NEUT, LIGHT_MUTATED_DRONE],
};

const lookup = mutaplasmidLookup(DATA);

describe('mutaplasmidLookup', () => {
  it('tells an abyssal type from any other', () => {
    expect(lookup.isAbyssalType(HEAVY_ABYSSAL_NEUT)).toBe(true);
    expect(lookup.isAbyssalType(LIGHT_MUTATED_DRONE)).toBe(true);
    expect(lookup.isAbyssalType(HEAVY_GREMLIN_NEUT)).toBe(false);
  });

  it('reads one mutaplasmid by type id', () => {
    expect(lookup.mutaplasmid(DECAYED_HEAVY_NEUT)).toEqual({
      typeId: DECAYED_HEAVY_NEUT,
      resultTypeId: HEAVY_ABYSSAL_NEUT,
      baseTypeIds: [HEAVY_GREMLIN_NEUT],
      attributes: [{ id: 6, min: 0.85, max: 1.2, highIsGood: false }],
    });
    expect(lookup.mutaplasmid(DAMAGE_CONTROL_II)).toBeUndefined();
  });

  it('lists the mutaplasmids a base module takes, by type id', () => {
    expect(lookup.mutaplasmidsForBase(HEAVY_GREMLIN_NEUT).map((m) => m.typeId)).toEqual([
      DECAYED_HEAVY_NEUT,
      GRAVID_HEAVY_NEUT,
    ]);
    expect(lookup.mutaplasmidsForBase(HEAVY_NEUT_II).map((m) => m.typeId)).toEqual([
      GRAVID_HEAVY_NEUT,
    ]);
    expect(lookup.mutaplasmidsForBase(DAMAGE_CONTROL_II)).toEqual([]);
  });

  it('lists the mutaplasmids that make an abyssal type', () => {
    expect(lookup.mutaplasmidsForResult(HEAVY_ABYSSAL_NEUT).map((m) => m.typeId)).toEqual([
      DECAYED_HEAVY_NEUT,
      GRAVID_HEAVY_NEUT,
    ]);
  });

  it('resolves base + mutaplasmid to the abyssal type, or null when the pair is not legal', () => {
    expect(lookup.resultingType(HEAVY_GREMLIN_NEUT, GRAVID_HEAVY_NEUT)).toBe(HEAVY_ABYSSAL_NEUT);
    expect(lookup.resultingType(HEAVY_NEUT_II, DECAYED_HEAVY_NEUT)).toBeNull();
    expect(lookup.resultingType(DAMAGE_CONTROL_II, GRAVID_HEAVY_NEUT)).toBeNull();
    expect(lookup.resultingType(HEAVY_GREMLIN_NEUT, 1)).toBeNull();
  });

  it('turns a multiplier range into absolute values on the base’s own value', () => {
    // Heavy Gremlin: 500 GJ activation cost.
    expect(lookup.rollRange(GRAVID_HEAVY_NEUT, 6, 500)).toEqual({
      min: 400,
      max: 650,
      highIsGood: false,
    });
    expect(lookup.rollRange(GRAVID_HEAVY_NEUT, 999, 500)).toBeNull();
    expect(lookup.rollRange(1, 6, 500)).toBeNull();
  });

  it('keeps min below max for a negative base value', () => {
    const range = lookup.rollRange(GRAVID_HEAVY_NEUT, 6, -10);
    expect(range?.min).toBeCloseTo(-13);
    expect(range?.max).toBeCloseTo(-8);
  });

  it('maps internal attribute names to ids and back', () => {
    expect(lookup.attributeId('capacitorNeed')).toBe(6);
    expect(lookup.attributeId('nope')).toBeUndefined();
    expect(lookup.attributeName(97)).toBe('energyNeutralizerAmount');
    expect(lookup.attributeName(1)).toBeUndefined();
  });
});

describe('rollQuality', () => {
  it('reads 0 for the worst roll and 1 for the best, flipped when low is good', () => {
    expect(rollQuality(650, { min: 400, max: 650, highIsGood: true })).toBe(1);
    expect(rollQuality(650, { min: 400, max: 650, highIsGood: false })).toBe(0);
    expect(rollQuality(525, { min: 400, max: 650, highIsGood: false })).toBe(0.5);
  });

  it('clamps a value outside the range and treats an empty range as best', () => {
    expect(rollQuality(1000, { min: 400, max: 650, highIsGood: true })).toBe(1);
    expect(rollQuality(5, { min: 5, max: 5, highIsGood: true })).toBe(1);
  });
});

describe('normaliseMutation', () => {
  const rolled = {
    baseTypeId: HEAVY_GREMLIN_NEUT,
    mutaplasmidTypeId: GRAVID_HEAVY_NEUT,
    attributes: { 6: 419.25, 54: 15680, 97: 591.36 },
  };

  it('keeps a legal mutation as it is', () => {
    expect(normaliseMutation(HEAVY_ABYSSAL_NEUT, rolled, lookup)).toEqual(rolled);
  });

  it('drops attributes the mutaplasmid does not roll, and non-finite values', () => {
    expect(
      normaliseMutation(
        HEAVY_ABYSSAL_NEUT,
        { ...rolled, attributes: { 6: 419.25, 50: 5, 9: 99, 97: Number.NaN } },
        lookup
      )
    ).toEqual({ ...rolled, attributes: { 6: 419.25 } });
  });

  it('is null when the base, mutaplasmid and type do not belong together', () => {
    expect(normaliseMutation(DAMAGE_CONTROL_II, rolled, lookup)).toBeNull();
    expect(
      normaliseMutation(HEAVY_ABYSSAL_NEUT, { ...rolled, baseTypeId: DAMAGE_CONTROL_II }, lookup)
    ).toBeNull();
    expect(
      normaliseMutation(HEAVY_ABYSSAL_NEUT, { ...rolled, mutaplasmidTypeId: 1 }, lookup)
    ).toBeNull();
  });
});

describe('mutationFromDynamicItem', () => {
  // The live ESI sample in the research notes: contract item 1054645434634.
  const dynamic = {
    created_by: 2123627600,
    source_type_id: HEAVY_GREMLIN_NEUT,
    mutator_type_id: GRAVID_HEAVY_NEUT,
    dogma_attributes: [
      { attribute_id: 6, value: 419.25 },
      { attribute_id: 9, value: 40 },
      { attribute_id: 54, value: 15680 },
      { attribute_id: 97, value: 591.36 },
    ],
  };

  it('keeps only the attributes the mutaplasmid rolls, out of ESI’s full set', () => {
    expect(mutationFromDynamicItem(HEAVY_ABYSSAL_NEUT, dynamic, lookup)).toEqual({
      baseTypeId: HEAVY_GREMLIN_NEUT,
      mutaplasmidTypeId: GRAVID_HEAVY_NEUT,
      attributes: { 6: 419.25, 54: 15680, 97: 591.36 },
    });
  });

  it('is null for a dynamic item that does not match its type', () => {
    expect(mutationFromDynamicItem(LIGHT_MUTATED_DRONE, dynamic, lookup)).toBeNull();
  });
});

describe('mutationStatus', () => {
  it('reads a plain item as none', () => {
    expect(mutationStatus({ typeId: HEAVY_GREMLIN_NEUT }, lookup)).toBe('none');
  });

  it('reads an abyssal item with rolls as rolled', () => {
    expect(
      mutationStatus(
        {
          typeId: HEAVY_ABYSSAL_NEUT,
          mutation: {
            baseTypeId: HEAVY_GREMLIN_NEUT,
            mutaplasmidTypeId: GRAVID_HEAVY_NEUT,
            attributes: { 6: 419.25 },
          },
        },
        lookup
      )
    ).toBe('rolled');
  });

  it('reads base-and-mutaplasmid-but-no-rolls as rollsUnknown', () => {
    expect(
      mutationStatus(
        {
          typeId: HEAVY_ABYSSAL_NEUT,
          mutation: {
            baseTypeId: HEAVY_GREMLIN_NEUT,
            mutaplasmidTypeId: GRAVID_HEAVY_NEUT,
            attributes: {},
          },
        },
        lookup
      )
    ).toBe('rollsUnknown');
  });

  it('reads an abyssal item with no mutation (killmail, In-game Fitting, bare EFT line) as baseUnknown', () => {
    expect(mutationStatus({ typeId: HEAVY_ABYSSAL_NEUT }, lookup)).toBe('baseUnknown');
  });
});

describe('withoutMutation', () => {
  it('drops the mutation when the type changes, keeps it otherwise', () => {
    const module = {
      typeId: HEAVY_ABYSSAL_NEUT,
      mutation: { baseTypeId: 1, mutaplasmidTypeId: 2, attributes: {} },
      state: 'active' as const,
    };
    expect(withoutMutation(module, HEAVY_GREMLIN_NEUT)).toEqual({
      typeId: HEAVY_GREMLIN_NEUT,
      state: 'active',
    });
    expect(withoutMutation(module, HEAVY_ABYSSAL_NEUT)).toBe(module);
  });
});

describe('hasMutations', () => {
  const fit = (mutation?: Fitting['drones'][number]['mutation']): Fitting => ({
    name: 'x',
    shipTypeId: 1,
    modules: [],
    drones: [
      {
        typeId: LIGHT_MUTATED_DRONE,
        quantity: 1,
        state: 'online',
        ...(mutation ? { mutation } : {}),
      },
    ],
    cargo: [],
  });

  it('is true for a mutated drone or module, false otherwise', () => {
    expect(
      hasMutations(
        fit({ baseTypeId: HOBGOBLIN_I, mutaplasmidTypeId: EXIGENT_LIGHT_FIREPOWER, attributes: {} })
      )
    ).toBe(true);
    expect(hasMutations(fit())).toBe(false);
  });
});

describe('normaliseFittingMutations', () => {
  it('keeps legal mutations, filters their rolls, and drops one that does not belong', () => {
    const fitting: Fitting = {
      name: 'Forged',
      shipTypeId: 17843,
      modules: [
        {
          slot: 'high' as const,
          slotIndex: 0,
          typeId: HEAVY_ABYSSAL_NEUT,
          state: 'active' as const,
          mutation: {
            baseTypeId: HEAVY_GREMLIN_NEUT,
            mutaplasmidTypeId: GRAVID_HEAVY_NEUT,
            attributes: { 6: 419.25, 50: 0 },
          },
        },
        // A mutation forged onto a plain module.
        {
          slot: 'low' as const,
          slotIndex: 0,
          typeId: DAMAGE_CONTROL_II,
          state: 'online' as const,
          mutation: {
            baseTypeId: HEAVY_GREMLIN_NEUT,
            mutaplasmidTypeId: GRAVID_HEAVY_NEUT,
            attributes: { 6: 1 },
          },
        },
      ],
      drones: [
        {
          typeId: LIGHT_MUTATED_DRONE,
          quantity: 1,
          state: 'online' as const,
          mutation: {
            baseTypeId: HOBGOBLIN_I,
            mutaplasmidTypeId: EXIGENT_LIGHT_FIREPOWER,
            attributes: {},
          },
        },
      ],
      cargo: [],
    };
    const clean = normaliseFittingMutations(fitting, lookup);
    expect(clean.modules[0]?.mutation?.attributes).toEqual({ 6: 419.25 });
    expect(clean.modules[1]).toEqual({
      slot: 'low',
      slotIndex: 0,
      typeId: DAMAGE_CONTROL_II,
      state: 'online',
    });
    expect(clean.drones[0]).toBe(fitting.drones[0]);
  });

  it('hands back the same Fitting when nothing is mutated', () => {
    const plain: Fitting = { name: 'x', shipTypeId: 1, modules: [], drones: [], cargo: [] };
    expect(normaliseFittingMutations(plain, lookup)).toBe(plain);
  });
});
