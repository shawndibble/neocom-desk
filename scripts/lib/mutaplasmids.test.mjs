import { describe, it, expect } from 'vitest';
import { bakeMutaplasmids, dogmaAttributeInfo } from './mutaplasmids.mjs';

// Shaped like CCP's dynamicItemAttributes.jsonl rows (build 3607705): the
// Decayed and Unstable 500MN Microwarpdrive mutaplasmids, trimmed.
const DECAYED_MWD = {
  _key: 47299,
  attributeIDs: [
    { _key: 6, max: 1.2, min: 0.85 },
    { _key: 20, highIsGood: false, max: 1.035, min: 0.97 },
  ],
  inputOutputMapping: [{ applicableTypes: [12076, 5975], resultingType: 47745 }],
};
const UNSTABLE_MWD = {
  _key: 47297,
  attributeIDs: [{ _key: 6, max: 1.4, min: 0.6 }],
  inputOutputMapping: [{ applicableTypes: [5975], resultingType: 47745 }],
};
const ATTRIBUTES = new Map([
  [6, { name: 'capacitorNeed', highIsGood: false }],
  [20, { name: 'speedFactor', highIsGood: true }],
]);

describe('bakeMutaplasmids', () => {
  it('keeps each mutaplasmid’s result, sorted bases and roll ranges', () => {
    const baked = bakeMutaplasmids([DECAYED_MWD], ATTRIBUTES);
    expect(baked.mutaplasmids['47299']).toEqual({
      result: 47745,
      bases: [5975, 12076],
      attributes: [
        { id: 6, min: 0.85, max: 1.2, highIsGood: false },
        { id: 20, min: 0.97, max: 1.035, highIsGood: false },
      ],
    });
  });

  it('resolves highIsGood: the row’s own override, else the attribute’s', () => {
    const baked = bakeMutaplasmids([DECAYED_MWD], ATTRIBUTES);
    const [capacitor, speed] = baked.mutaplasmids['47299'].attributes;
    expect(capacitor.highIsGood).toBe(false); // attribute default
    expect(speed.highIsGood).toBe(false); // row override beats the attribute's true
  });

  it('names every mutated attribute by its internal (EFT) name', () => {
    const baked = bakeMutaplasmids([DECAYED_MWD, UNSTABLE_MWD], ATTRIBUTES);
    expect(baked.attributeNames).toEqual({ 6: 'capacitorNeed', 20: 'speedFactor' });
  });

  it('lists each abyssal type once, sorted', () => {
    const baked = bakeMutaplasmids(
      [
        DECAYED_MWD,
        UNSTABLE_MWD,
        {
          ...UNSTABLE_MWD,
          _key: 1,
          inputOutputMapping: [{ applicableTypes: [2], resultingType: 3 }],
        },
      ],
      ATTRIBUTES
    );
    expect(baked.abyssalTypeIds).toEqual([3, 47745]);
  });

  it('throws on an attribute it cannot name, so a bake never ships an unnamed roll', () => {
    expect(() =>
      bakeMutaplasmids(
        [{ ...UNSTABLE_MWD, attributeIDs: [{ _key: 999, min: 1, max: 2 }] }],
        ATTRIBUTES
      )
    ).toThrow(/999/);
  });

  it('throws on a row whose shape changed (not exactly one mapping)', () => {
    expect(() =>
      bakeMutaplasmids([{ ...UNSTABLE_MWD, inputOutputMapping: [] }], ATTRIBUTES)
    ).toThrow(/47297/);
  });
});

describe('dogmaAttributeInfo', () => {
  it('reads the internal name and direction, treating a missing flag as high-is-good', () => {
    const info = dogmaAttributeInfo([
      { _key: 6, name: 'capacitorNeed', highIsGood: false, displayName: { en: 'Activation Cost' } },
      { _key: 9, name: 'hp' },
    ]);
    expect(info.get(6)).toEqual({ name: 'capacitorNeed', highIsGood: false });
    expect(info.get(9)).toEqual({ name: 'hp', highIsGood: true });
  });
});
