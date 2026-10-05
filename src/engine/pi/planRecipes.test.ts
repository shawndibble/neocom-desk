import { describe, it, expect } from 'vitest';
import { rankRecipes, type RecipeRow } from './planRecipes';

const row = (
  typeId: number,
  name: string,
  tier: RecipeRow['tier'],
  planetType: RecipeRow['planetType'],
  iskPerDay: number,
  m3PerDay = 10
): RecipeRow => ({ typeId, name, tier, planetType, iskPerDay, m3PerDay });

// Lava hosts Silicon (P1) and Coolant (P2); Barren hosts Silicon, Water and Rocket Fuel.
const ROWS: RecipeRow[] = [
  row(10, 'Silicon', 1, 'lava', 100_000),
  row(10, 'Silicon', 1, 'barren', 90_000),
  row(20, 'Coolant', 2, 'lava', 150_000),
  row(30, 'Rocket Fuel', 2, 'barren', 96_000),
  row(40, 'Water', 1, 'barren', 95_000),
];

describe('rankRecipes', () => {
  it('ranks by ISK a day per planet, best first', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: [], filter: 'any' });
    expect(recipes.map((r) => r.name)).toEqual(['Coolant', 'Silicon', 'Rocket Fuel', 'Water']);
  });

  it('never ranks a raw P0 or anything above a one-planet P2', () => {
    const { recipes } = rankRecipes({
      rows: [
        ...ROWS,
        row(99, 'Raw thing', 0, 'lava', 999_999),
        row(98, 'Specialized', 3, 'lava', 999_999),
      ],
      haveTypes: [],
      filter: 'any',
    });
    expect(recipes.map((r) => r.typeId)).not.toContain(99);
    expect(recipes.map((r) => r.typeId)).not.toContain(98);
  });

  it('filters to processed (P1) or factory goods (P2)', () => {
    const p1 = rankRecipes({ rows: ROWS, haveTypes: [], filter: 'p1' }).recipes;
    const p2 = rankRecipes({ rows: ROWS, haveTypes: [], filter: 'p2' }).recipes;
    expect(p1.map((r) => r.name)).toEqual(['Silicon', 'Water']);
    expect(p2.map((r) => r.name)).toEqual(['Coolant', 'Rocket Fuel']);
  });

  it('lists every planet type that hosts a recipe and marks the ones the pilot has', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: ['barren'], filter: 'any' });
    const silicon = recipes.find((r) => r.name === 'Silicon')!;
    expect(silicon.hostTypes).toEqual(['barren', 'lava']);
    expect(silicon.haveTypes).toEqual(['barren']);
  });

  it('values a recipe on a planet type the pilot has when they have one', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: ['barren'], filter: 'any' });
    const silicon = recipes.find((r) => r.name === 'Silicon')!;
    expect(silicon.useType).toBe('barren');
    expect(silicon.iskPerDay).toBe(90_000);
  });

  it('values a recipe on its best planet type when the pilot has none that hosts it', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: ['ice'], filter: 'any' });
    const silicon = recipes.find((r) => r.name === 'Silicon')!;
    expect(silicon.useType).toBe('lava');
    expect(silicon.iskPerDay).toBe(100_000);
  });

  it('compares each recipe with the best processed product on the planet type it would use', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: [], filter: 'any' });
    const coolant = recipes.find((r) => r.name === 'Coolant')!;
    expect(coolant.comparison).toMatchObject({
      verdict: 'better',
      isReference: false,
      versus: { name: 'Silicon', planetType: 'lava', iskPerDay: 100_000 },
    });
  });

  it('calls a recipe within 5% of its reference about the same, and beyond that better or worse', () => {
    const { recipes } = rankRecipes({
      rows: [
        row(10, 'Silicon', 1, 'barren', 100_000),
        row(30, 'Rocket Fuel', 2, 'barren', 104_000),
        row(31, 'Oxides', 2, 'barren', 94_000),
        row(32, 'Fertilizer', 2, 'barren', 106_000),
      ],
      haveTypes: ['barren'],
      filter: 'any',
    });
    const verdict = (name: string) => recipes.find((r) => r.name === name)!.comparison!.verdict;
    expect(verdict('Rocket Fuel')).toBe('same');
    expect(verdict('Oxides')).toBe('worse');
    expect(verdict('Fertilizer')).toBe('better');
  });

  it('marks the reference product itself rather than comparing it with itself', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: ['lava'], filter: 'any' });
    const silicon = recipes.find((r) => r.name === 'Silicon')!;
    expect(silicon.comparison).toMatchObject({ isReference: true, verdict: 'same' });
  });

  it('keeps the reference when a filter hides it', () => {
    const { recipes } = rankRecipes({ rows: ROWS, haveTypes: [], filter: 'p2' });
    expect(recipes[0].comparison?.versus.name).toBe('Silicon');
  });

  it('has no comparison when the planet type hosts no priced processed product', () => {
    const { recipes } = rankRecipes({
      rows: [row(20, 'Coolant', 2, 'lava', 150_000)],
      haveTypes: [],
      filter: 'any',
    });
    expect(recipes[0].comparison).toBeNull();
  });

  it('drops a recipe that earns nothing or has no figure, rather than ranking it at zero', () => {
    const { recipes, unpriced } = rankRecipes({
      rows: [
        ...ROWS,
        row(50, 'Loss maker', 1, 'barren', -5),
        row(51, 'No price', 1, 'barren', Number.NaN),
      ],
      haveTypes: [],
      filter: 'any',
      unpriced: [51, 52],
    });
    expect(recipes.map((r) => r.typeId)).not.toContain(50);
    expect(recipes.map((r) => r.typeId)).not.toContain(51);
    expect(unpriced).toEqual([51, 52]);
  });

  it('reports the best figure a new planet could earn, whatever the filter or planet types', () => {
    const result = rankRecipes({ rows: ROWS, haveTypes: ['barren'], filter: 'p1' });
    expect(result.bestAnywherePerDay).toBe(150_000);
  });

  it('has no best figure when nothing ranks', () => {
    expect(rankRecipes({ rows: [], haveTypes: [], filter: 'any' })).toEqual({
      recipes: [],
      bestAnywherePerDay: null,
      unpriced: [],
    });
  });

  it('breaks an equal figure toward the shallower tier, then the lower type id', () => {
    const { recipes } = rankRecipes({
      rows: [
        row(30, 'B', 2, 'lava', 100),
        row(20, 'A', 2, 'lava', 100),
        row(40, 'C', 1, 'lava', 100),
      ],
      haveTypes: [],
      filter: 'any',
    });
    expect(recipes.map((r) => r.name)).toEqual(['C', 'A', 'B']);
  });
});
