import { describe, it, expect } from 'vitest';
import { bakeDecryptors, bakeInvention, GENERIC_DECRYPTOR_GROUP_ID } from './invention.mjs';

// Rifter Blueprint (691) rows as they stand in Fuzzwork dump 3607705: it
// manufactures a Rifter (activity 1), copies (5) and invents the Wolf (11372)
// and Jaguar (11401) blueprints (8). Research rows (3, 4) are left in to show
// they are ignored.
const RIFTER_BP = 691;
const rifterRows = {
  activities: [
    { typeID: RIFTER_BP, activityID: 1, time: 6000 },
    { typeID: RIFTER_BP, activityID: 3, time: 2100 },
    { typeID: RIFTER_BP, activityID: 4, time: 2100 },
    { typeID: RIFTER_BP, activityID: 5, time: 4800 },
    { typeID: RIFTER_BP, activityID: 8, time: 63900 },
  ],
  materials: [
    { typeID: RIFTER_BP, activityID: 8, materialTypeID: 20172, quantity: 2 },
    { typeID: RIFTER_BP, activityID: 8, materialTypeID: 20424, quantity: 2 },
    { typeID: RIFTER_BP, activityID: 1, materialTypeID: 34, quantity: 32000 },
  ],
  products: [
    { typeID: RIFTER_BP, activityID: 8, productTypeID: 11372, quantity: 1 },
    { typeID: RIFTER_BP, activityID: 8, productTypeID: 11401, quantity: 1 },
    { typeID: RIFTER_BP, activityID: 1, productTypeID: 587, quantity: 1 },
  ],
  probabilities: [
    { typeID: RIFTER_BP, activityID: 8, productTypeID: 11372, probability: 0.3 },
    { typeID: RIFTER_BP, activityID: 8, productTypeID: 11401, probability: 0.3 },
  ],
  skills: [
    { typeID: RIFTER_BP, activityID: 8, skillID: 11445, level: 1 },
    { typeID: RIFTER_BP, activityID: 8, skillID: 11452, level: 1 },
    { typeID: RIFTER_BP, activityID: 8, skillID: 21791, level: 1 },
    { typeID: RIFTER_BP, activityID: 1, skillID: 3380, level: 1 },
  ],
};
const allPublished = () => true;

describe('bakeInvention', () => {
  it("keeps a T1 blueprint's copy time and its invention datacores, products, runs, chance and skills", () => {
    const out = bakeInvention({
      ...rifterRows,
      isBlueprint: allPublished,
      isPublished: allPublished,
    });
    expect(out).toEqual({
      [RIFTER_BP]: {
        copyTime: 4800,
        invention: {
          time: 63900,
          materials: [
            { typeID: 20172, quantity: 2 },
            { typeID: 20424, quantity: 2 },
          ],
          products: [
            { typeID: 11372, quantity: 1, probability: 0.3 },
            { typeID: 11401, quantity: 1, probability: 0.3 },
          ],
          skills: [
            { typeID: 11445, level: 1 },
            { typeID: 11452, level: 1 },
            { typeID: 21791, level: 1 },
          ],
        },
      },
    });
  });

  it('matches each product to its own chance when one blueprint invents several', () => {
    const out = bakeInvention({
      ...rifterRows,
      probabilities: [
        { typeID: RIFTER_BP, activityID: 8, productTypeID: 11401, probability: 0.34 },
        { typeID: RIFTER_BP, activityID: 8, productTypeID: 11372, probability: 0.3 },
      ],
      isBlueprint: allPublished,
      isPublished: allPublished,
    });
    expect(out[RIFTER_BP].invention.products).toEqual([
      { typeID: 11372, quantity: 1, probability: 0.3 },
      { typeID: 11401, quantity: 1, probability: 0.34 },
    ]);
  });

  it('skips relic sources (not a blueprint) and unpublished products', () => {
    const RELIC = 30752;
    const out = bakeInvention({
      activities: [...rifterRows.activities, { typeID: RELIC, activityID: 8, time: 3600 }],
      materials: rifterRows.materials,
      products: [
        ...rifterRows.products,
        { typeID: RELIC, activityID: 8, productTypeID: 30000, quantity: 20 },
      ],
      probabilities: [
        ...rifterRows.probabilities,
        { typeID: RELIC, activityID: 8, productTypeID: 30000, probability: 0.26 },
      ],
      skills: rifterRows.skills,
      isBlueprint: (id) => id !== RELIC,
      isPublished: (id) => id !== 11401,
    });
    expect(Object.keys(out)).toEqual([String(RIFTER_BP)]);
    expect(out[RIFTER_BP].invention.products.map((p) => p.typeID)).toEqual([11372]);
  });

  it('keeps copy time alone for a blueprint with nothing to invent', () => {
    const out = bakeInvention({
      activities: [{ typeID: 1, activityID: 5, time: 900 }],
      materials: [],
      products: [],
      probabilities: [],
      skills: [],
      isBlueprint: allPublished,
      isPublished: allPublished,
    });
    expect(out).toEqual({ 1: { copyTime: 900 } });
  });

  it('fails the bake when an invented product has no success chance', () => {
    expect(() =>
      bakeInvention({
        ...rifterRows,
        probabilities: rifterRows.probabilities.slice(0, 1),
        isBlueprint: allPublished,
        isPublished: allPublished,
      })
    ).toThrow(/691.*11401/);
  });

  it('fails the bake when a success chance is zero or unreadable', () => {
    for (const probability of [0, NaN]) {
      expect(() =>
        bakeInvention({
          ...rifterRows,
          probabilities: [
            rifterRows.probabilities[0],
            { ...rifterRows.probabilities[1], probability },
          ],
          isBlueprint: allPublished,
          isPublished: allPublished,
        })
      ).toThrow(/691.*11401/);
    }
  });
});

describe('bakeDecryptors', () => {
  const decryptor = (typeID, name, groupID = GENERIC_DECRYPTOR_GROUP_ID) => ({
    typeID,
    name,
    groupID,
    published: true,
  });
  const modifiers = (chance, me, te, runs) =>
    new Map([
      [1112, chance],
      [1113, me],
      [1114, te],
      [1124, runs],
    ]);

  // In-game values (EVE University wiki, Invention): Accelerant +20% chance,
  // +2 ME, +10 TE, +1 run; Attainment +80%, -1 ME, +4 TE, +4 runs.
  it('reads chance multiplier, ME, TE and runs off the generic decryptors only', () => {
    const types = [
      decryptor(34201, 'Accelerant Decryptor'),
      decryptor(34202, 'Attainment Decryptor'),
      // Pre-Crius faction decryptor: still in the dump, no longer in game.
      decryptor(21574, 'Esoteric Accelerant', 731),
      { ...decryptor(34999, 'Unpublished Decryptor'), published: false },
    ];
    const attrs = new Map([
      [34201, modifiers(1.2, 2, 10, 1)],
      [34202, modifiers(1.8, -1, 4, 4)],
      [21574, modifiers(1.2, 2, 10, 1)],
      [34999, modifiers(1, 0, 0, 0)],
    ]);
    expect(bakeDecryptors(types, attrs)).toEqual({
      34201: { name: 'Accelerant Decryptor', probabilityMultiplier: 1.2, me: 2, te: 10, runs: 1 },
      34202: { name: 'Attainment Decryptor', probabilityMultiplier: 1.8, me: -1, te: 4, runs: 4 },
    });
  });

  it('treats a missing modifier as no change', () => {
    const types = [decryptor(34206, 'Symmetry Decryptor')];
    const attrs = new Map([[34206, new Map([[1114, 8]])]]);
    expect(bakeDecryptors(types, attrs)).toEqual({
      34206: { name: 'Symmetry Decryptor', probabilityMultiplier: 1, me: 0, te: 8, runs: 0 },
    });
  });
});
