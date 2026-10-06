import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { PlanetType } from '@/engine/pi/goalTypes';
import type { RecipeRow } from '@/engine/pi/planRecipes';
import {
  buildAllProducts,
  buildChainPicks,
  buildFindBestView,
  defaultHighsecOnly,
  needsSkyhookNote,
  type FindBestInput,
} from './findBestView';
import type { ChainEstimateView } from './chainEstimateModel';
import { planetTypesOf } from './productPlanets';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;
const ALL = planetTypesOf(pi);

const SILICON = Number(Object.entries(pi.schematics).find(([, s]) => s.name === 'Silicon')?.[0]);

const row = (
  typeId: number,
  name: string,
  tier: 1 | 2,
  planetType: PlanetType,
  iskPerDay: number
): RecipeRow => ({ typeId, name, tier, planetType, iskPerDay, m3PerDay: 1 });

// Silicon P1 on lava/barren, Coolant P2 on lava, Proteins P1 on oceanic, Water P1 on barren.
const ROWS: RecipeRow[] = [
  row(SILICON, 'Silicon', 1, 'lava', 100),
  row(SILICON, 'Silicon', 1, 'barren', 90),
  row(20, 'Coolant', 2, 'lava', 150),
  row(30, 'Proteins', 1, 'oceanic', 200),
  row(40, 'Water', 1, 'barren', 95),
];

const input = (over: Partial<FindBestInput> = {}): FindBestInput => ({
  rows: ROWS,
  unpriced: [],
  colonyTypes: [],
  allTypes: ALL,
  off: new Set(),
  whatIf: new Set(),
  filter: 'any',
  madeTypeIds: new Set(),
  ...over,
});

describe('buildFindBestView', () => {
  it('ranks what the pilot can make today above what needs a planet they lack', () => {
    // Oceanic Proteins (200) is the top ISK pick, but the pilot only runs lava.
    const view = buildFindBestView(input({ colonyTypes: ['lava'] }));
    const names = view.cards.map((card) => card.recipe.name);
    expect(names).toEqual(['Coolant', 'Silicon', 'Proteins', 'Water']);
    expect(view.cards.map((card) => card.makeableNow)).toEqual([true, true, false, false]);
    expect(view.cards.map((card) => card.rank)).toEqual([1, 2, 3, 4]);
    expect(view.addDividerBefore).toBe(3);
  });

  it('puts no divider where nothing, or everything, is makeable today', () => {
    expect(buildFindBestView(input()).addDividerBefore).toBeNull();
    expect(
      buildFindBestView(input({ colonyTypes: ['lava'], filter: 'p2' })).addDividerBefore
    ).toBeNull();
    expect(
      buildFindBestView(input({ colonyTypes: ['oceanic'], filter: 'p1' })).cards[0].recipe.name
    ).toBe('Proteins');
  });

  it('with no colonies, every type is on and every recipe reads find one', () => {
    const view = buildFindBestView(input());
    expect(view.hasColonies).toBe(false);
    expect(view.toggles).toHaveLength(ALL.length);
    expect(view.toggles.every((t) => t.on)).toBe(true);
    expect(view.chips).toEqual([]);
    expect(view.cards.map((c) => c.recipe.name)).toEqual([
      'Proteins',
      'Coolant',
      'Silicon',
      'Water',
    ]);
    expect(view.cards.every((c) => c.hosts.every((h) => h.state === 'find'))).toBe(true);
  });

  it('with no colonies, switching a type off hides recipes only it hosts', () => {
    const view = buildFindBestView(input({ off: new Set<PlanetType>(['oceanic']) }));
    expect(view.cards.map((c) => c.recipe.name)).not.toContain('Proteins');
    expect(view.toggles.find((t) => t.type === 'oceanic')?.on).toBe(false);
  });

  it('filters to processed (P1) or factory goods (P2)', () => {
    const p1 = buildFindBestView(input({ filter: 'p1' }));
    expect(p1.cards.every((c) => c.recipe.tier === 1)).toBe(true);
    const p2 = buildFindBestView(input({ filter: 'p2' }));
    expect(p2.cards.map((c) => c.recipe.name)).toEqual(['Coolant']);
  });

  it('pre-marks colony types and offers the rest as what-if chips with unlock counts', () => {
    const view = buildFindBestView(input({ colonyTypes: ['barren'] }));
    expect(view.toggles.map((t) => t.type)).toEqual(['barren']);
    const lava = view.chips.find((c) => c.type === 'lava');
    expect(lava).toMatchObject({ on: false, unlocks: 1 }); // Coolant; Silicon is hosted on barren
    expect(view.chips.find((c) => c.type === 'oceanic')?.unlocks).toBe(1);
    expect(view.chips.map((c) => c.type)).not.toContain('barren');
    const silicon = view.cards.find((c) => c.recipe.name === 'Silicon');
    expect(silicon?.hosts).toEqual([
      { type: 'barren', state: 'have' },
      { type: 'lava', state: 'find' },
    ]);
  });

  it('a what-if planet marks the recipes only it unlocks as new', () => {
    const view = buildFindBestView(
      input({ colonyTypes: ['barren'], whatIf: new Set<PlanetType>(['lava']) })
    );
    const byName = Object.fromEntries(view.cards.map((c) => [c.recipe.name, c]));
    expect(byName.Coolant.isNew).toBe(true);
    expect(byName.Coolant.hosts).toEqual([{ type: 'lava', state: 'whatif' }]);
    expect(byName.Silicon.isNew).toBe(false);
    expect(byName.Water.isNew).toBe(false);
    expect(view.chips.find((c) => c.type === 'lava')?.on).toBe(true);
  });

  it('switching a colony type off makes its recipes read find one', () => {
    const view = buildFindBestView(
      input({ colonyTypes: ['barren', 'lava'], off: new Set<PlanetType>(['lava']) })
    );
    const coolant = view.cards.find((c) => c.recipe.name === 'Coolant');
    expect(coolant?.hosts).toEqual([{ type: 'lava', state: 'find' }]);
  });

  it('says the pilot already makes the best thing only when the top pick is made', () => {
    const made = buildFindBestView(input({ colonyTypes: ['oceanic'], madeTypeIds: new Set([30]) }));
    expect(made.alreadyBest).toBe(true);
    const other = buildFindBestView(
      input({ colonyTypes: ['oceanic'], madeTypeIds: new Set([SILICON]) })
    );
    expect(other.alreadyBest).toBe(false);
    expect(buildFindBestView(input({ madeTypeIds: new Set([30]) })).alreadyBest).toBe(false);
  });

  it('tells a tier filter that ranks nothing apart from toggles that hide everything', () => {
    const p1Only = [row(SILICON, 'Silicon', 1, 'lava', 100)];
    const view = buildFindBestView(input({ rows: p1Only, filter: 'p2' }));
    expect(view.cards).toEqual([]);
    expect(view.hasRecipesAtAll).toBe(true);
    expect(buildFindBestView(input({ rows: [], filter: 'p2' })).hasRecipesAtAll).toBe(false);
  });

  it('does not call it the best when the type that makes it is switched off', () => {
    const view = buildFindBestView(
      input({
        colonyTypes: ['oceanic'],
        off: new Set<PlanetType>(['oceanic']),
        madeTypeIds: new Set([30]),
      })
    );
    expect(view.alreadyBest).toBe(false);
  });

  it('counts recipes the market has no price for', () => {
    expect(buildFindBestView(input({ unpriced: [5, 6] })).unpricedCount).toBe(2);
  });
});

describe('finder defaults', () => {
  it('Highsec only starts on for a highsec home only', () => {
    expect(defaultHighsecOnly(0.9)).toBe(true);
    expect(defaultHighsecOnly(0.5)).toBe(true);
    expect(defaultHighsecOnly(0.4)).toBe(false);
    expect(defaultHighsecOnly(-0.6)).toBe(false);
    expect(defaultHighsecOnly(null)).toBe(false);
  });

  it('the nullsec note shows for nullsec only', () => {
    expect(needsSkyhookNote(-0.3)).toBe(true);
    expect(needsSkyhookNote(0.0)).toBe(true);
    expect(needsSkyhookNote(0.3)).toBe(false);
    expect(needsSkyhookNote(0.8)).toBe(false);
    expect(needsSkyhookNote(null)).toBe(false);
  });
});

describe('buildAllProducts', () => {
  const base = {
    rows: ROWS,
    colonyTypes: [] as PlanetType[],
    off: new Set<PlanetType>(),
    whatIf: new Set<PlanetType>(),
  };

  it('lists every product by tier, raws included', () => {
    const tiers = buildAllProducts(base, pi);
    expect(tiers.map((t) => t.tier)).toEqual([0, 1, 2, 3, 4]);
    expect(tiers[0].items).toHaveLength(pi.raw.length);
    expect(tiers[1].items.length).toBeGreaterThan(10);
    expect(tiers[4].items.length).toBeGreaterThan(0);
  });

  it('gives a ranked recipe its figure and a deeper product only the planets it needs', () => {
    const tiers = buildAllProducts(base, pi);
    const silicon = tiers[1].items.find((i) => i.name === 'Silicon');
    expect(silicon?.perDay).toBe(100);
    expect(silicon?.comparison).not.toBeNull();
    const p4 = tiers[4].items[0];
    expect(p4.perDay).toBeNull();
    expect(p4.planets).toBeGreaterThan(1);
  });

  it('gives a raw its best sell figure on a planet type it has, and never a comparison', () => {
    const MICRO = 2073; // barren, ice, oceanic, temperate
    const BASE_METALS = 2267; // no ice
    const tiers = buildAllProducts(
      {
        ...base,
        colonyTypes: ['ice'] as PlanetType[],
        rawRows: [
          { typeId: MICRO, planetType: 'ice', iskPerDay: 40_000 },
          { typeId: MICRO, planetType: 'barren', iskPerDay: 90_000 },
          { typeId: BASE_METALS, planetType: 'lava', iskPerDay: 70_000 },
        ],
      },
      pi
    );
    const raw = (id: number) => tiers[0].items.find((i) => i.typeId === id);
    expect(raw(MICRO)).toMatchObject({ perDay: 40_000, noPrice: false, comparison: null });
    expect(raw(BASE_METALS)).toMatchObject({ perDay: null, noPrice: false });
    // Raw column keeps name order whatever the figures.
    const names = tiers[0].items.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('says a raw the market does not price has no price, rather than nothing', () => {
    const MICRO = 2073;
    const tiers = buildAllProducts({ ...base, rawRows: [], rawUnpriced: [MICRO] }, pi);
    expect(tiers[0].items.find((i) => i.typeId === MICRO)).toMatchObject({
      perDay: null,
      noPrice: true,
    });
    expect(tiers[1].items.every((i) => !i.noPrice)).toBe(true);
  });

  it('fades what the planet types cannot reach and marks what a what-if unlocks', () => {
    const colonies = { ...base, colonyTypes: ['gas'] as PlanetType[] };
    const without = buildAllProducts(colonies, pi);
    const silicon = (tiers: typeof without) => tiers[1].items.find((i) => i.name === 'Silicon');
    expect(silicon(without)?.reachable).toBe(false);
    const withLava = buildAllProducts({ ...colonies, whatIf: new Set<PlanetType>(['lava']) }, pi);
    expect(silicon(withLava)).toMatchObject({ reachable: true, isNew: true });
  });
});

describe('buildChainPicks', () => {
  const ROBOTICS = 9848; // P3
  const NANO_FACTORY = 2869; // P4
  const view = (typeId: number, iskPerDay: number): ChainEstimateView => ({
    typeId,
    iskPerDay,
    unitsPerDay: 1,
    planets: ['lava', 'barren'],
    hostType: 'barren',
    m3PerWeek: 10,
    m3PerHaul: 10,
    haulDays: 7,
    ccLevel: 5,
    ccAssumed: false,
    rateSource: 'measured',
    headsPerExtractor: 10,
    ratePerHour: 1000,
  });
  const base = {
    colonyTypes: [] as PlanetType[],
    off: new Set<PlanetType>(),
    whatIf: new Set<PlanetType>(),
  };

  it('ranks priced P3/P4 by ISK a day, best first, and counts the unpriced', () => {
    const estimates = new Map([
      [ROBOTICS, view(ROBOTICS, 5)],
      [NANO_FACTORY, view(NANO_FACTORY, 50)],
    ]);
    const picks = buildChainPicks(base, pi, (id) => estimates.get(id) ?? null);
    expect(picks.rows.map((r) => r.typeId).slice(0, 2)).toEqual([NANO_FACTORY, ROBOTICS]);
    expect(picks.rows[0].tier).toBe(4);
    expect(picks.pending).toBe(0);
  });

  it('counts products still being priced as pending, not as rows', () => {
    const picks = buildChainPicks(base, pi, () => undefined);
    expect(picks.rows).toEqual([]);
    expect(picks.pending).toBeGreaterThan(0);
  });

  it("drops products the pilot's planet types cannot reach", () => {
    const picks = buildChainPicks({ ...base, colonyTypes: ['lava'] }, pi, (id) => view(id, 10));
    const all = buildChainPicks(base, pi, (id) => view(id, 10));
    expect(picks.rows.length).toBeLessThan(all.rows.length);
  });
});
