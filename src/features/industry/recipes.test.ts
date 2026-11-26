import { describe, it, expect, vi } from 'vitest';
import { NO_CHARACTER_MODIFIERS } from '@/engine/industry/characterModifiers';
import type { BlueprintMap, TypeMap } from '@/sde/types';
import { piFixture } from '@/sde/__fixtures__/pi';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import type { SubBuildContext } from '@/engine/industry/subBuild';
import type { BlueprintTierPools } from './recipes';

const BLUEPRINTS: BlueprintMap = {
  '9841': {
    name: 'Mechanical Parts Blueprint',
    time: 300,
    materials: [{ typeID: 34, quantity: 20 }],
    products: [{ typeID: 9840, quantity: 5 }],
    skills: [],
    activity: 'manufacturing',
  },
  '46156': {
    name: 'Reinforced Carbon Fiber Reaction Formula',
    time: 10800,
    materials: [{ typeID: 16650, quantity: 200 }],
    products: [{ typeID: 16667, quantity: 100 }],
    skills: [],
    activity: 'reaction',
  },
  '9843': {
    name: 'Isogen Blueprint',
    time: 100,
    materials: [{ typeID: 41, quantity: 3 }],
    products: [{ typeID: 40, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  '9844': {
    name: 'Nocxium Blueprint',
    time: 50,
    materials: [{ typeID: 42, quantity: 2 }],
    products: [{ typeID: 41, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
  '9845': {
    name: 'Zydrine Blueprint',
    time: 25,
    materials: [{ typeID: 43, quantity: 1 }],
    products: [{ typeID: 42, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};

const TYPES: TypeMap = {
  '9840': { name: 'Mechanical Parts', groupID: 334, volume: 1.5 },
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
  '16667': { name: 'Reinforced Carbon Fiber', groupID: 428, volume: 5 },
  '16650': { name: 'Fried Interface Circuit', groupID: 428, volume: 5 },
};

const PI = piFixture({
  schematics: {
    '2398': {
      schematicId: 133,
      name: 'Reactive Metals',
      cycleTime: 1800,
      quantity: 20,
      volume: 0.19,
      facility: 'basic',
      planetTypes: ['barren', 'lava', 'plasma'],
      inputs: [{ typeID: 2267, quantity: 3000, name: 'Base Metals' }],
    },
  },
  raw: [
    {
      typeID: 2267,
      name: 'Base Metals',
      volume: 0.005,
      planetTypes: ['barren', 'gas', 'lava', 'plasma', 'storm'],
    },
  ],
});

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async () => BLUEPRINTS),
  loadTypes: vi.fn(async () => TYPES),
}));

const { loadBlueprintCatalog } = await import('./blueprintCatalog');
const {
  acquisitionForLookup,
  buildPlanTypeIds,
  cloneBlueprintPools,
  materialRecipe,
  recipeInputTypeIds,
} = await import('./recipes');

const catalog = await loadBlueprintCatalog();

function owned(overrides: Partial<CharacterBlueprint>): CharacterBlueprint {
  return {
    item_id: 1,
    material_efficiency: 0,
    quantity: 1,
    runs: -1,
    time_efficiency: 0,
    type_id: 9841,
    location_id: 60003760,
    location_flag: 'Hangar',
    ...overrides,
  };
}

describe('materialRecipe', () => {
  it('returns the manufacturing recipe for a material some blueprint produces', () => {
    expect(materialRecipe(9840, { catalog, pi: PI, ownedBlueprints: [] })).toEqual({
      method: 'manufacturing',
      blueprint: {
        name: 'Mechanical Parts Blueprint',
        time: 300,
        materials: [{ typeID: 34, quantity: 20 }],
        products: [{ typeID: 9840, quantity: 5 }],
        activity: 'manufacturing',
        skills: [],
      },
      me: 0,
    });
  });

  it('quotes the sub-job at the ME of the copy the character owns', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [owned({ material_efficiency: 8 })],
    });
    expect(recipe).toMatchObject({ me: 8 });
  });

  it('clamps a nonsense owned ME into the range the engine accepts', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [owned({ material_efficiency: 99 })],
    });
    expect(recipe).toMatchObject({ me: 10 });
  });

  it('quotes an unowned blueprint at the assumed ME', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [],
      assumedMeForUnowned: 10,
    });
    expect(recipe).toMatchObject({ me: 10 });
  });

  it('still prefers a copy the character owns over the assumed ME', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [owned({ material_efficiency: 3 })],
      assumedMeForUnowned: 10,
    });
    expect(recipe).toMatchObject({ me: 3 });
  });

  it('assumes ME 0 when the caller supplies none, exactly as before', () => {
    expect(materialRecipe(9840, { catalog, pi: PI, ownedBlueprints: [] })).toMatchObject({ me: 0 });
  });

  it('clamps a nonsense assumed ME into the range the engine accepts', () => {
    const recipe = materialRecipe(9840, {
      catalog,
      pi: PI,
      ownedBlueprints: [],
      assumedMeForUnowned: 99,
    });
    expect(recipe).toMatchObject({ me: 10 });
  });

  it('returns the schematic for a planetary commodity', () => {
    expect(materialRecipe(2398, { catalog, pi: PI, ownedBlueprints: [] })).toEqual({
      method: 'planetary',
      outputQuantity: 20,
      inputs: [{ typeID: 2267, quantity: 3000 }],
    });
  });

  it('returns the reaction recipe for a material a reaction formula produces, with no ME (issue #460)', () => {
    expect(materialRecipe(16667, { catalog, pi: PI, ownedBlueprints: [] })).toEqual({
      method: 'reaction',
      blueprint: {
        name: 'Reinforced Carbon Fiber Reaction Formula',
        time: 10800,
        materials: [{ typeID: 16650, quantity: 200 }],
        products: [{ typeID: 16667, quantity: 100 }],
        activity: 'reaction',
        skills: [],
      },
    });
  });

  it('has no recipe for a raw planetary resource — an extractor pulls it, no schematic makes it', () => {
    expect(materialRecipe(2267, { catalog, pi: PI, ownedBlueprints: [] })).toBeNull();
  });

  it('has no recipe for a mineral', () => {
    expect(materialRecipe(34, { catalog, pi: PI, ownedBlueprints: [] })).toBeNull();
  });

  it('falls back to blueprints alone when pi.json is unavailable', () => {
    const sources = { catalog, pi: null, ownedBlueprints: [] };
    expect(materialRecipe(2398, sources)).toBeNull();
    expect(materialRecipe(9840, sources)).toMatchObject({ method: 'manufacturing' });
  });
});

describe('recipeInputTypeIds', () => {
  it('collects one level of recipe inputs, deduplicated', () => {
    const ids = recipeInputTypeIds([9840, 2398, 34], { catalog, pi: PI });
    expect(ids.sort((a, b) => a - b)).toEqual([34, 2267]);
  });

  it('is empty when nothing in the list is produced by anything', () => {
    expect(recipeInputTypeIds([34], { catalog, pi: PI })).toEqual([]);
  });
});

describe('buildPlanTypeIds', () => {
  const blueprint = {
    name: 'Widening test blueprint',
    time: 60,
    materials: [
      { typeID: 2398, quantity: 1 },
      { typeID: 40, quantity: 1 },
    ],
    products: [{ typeID: 9840, quantity: 1 }],
  };

  it('walks the whole recipe tree, not a fixed number of levels', () => {
    const ids = buildPlanTypeIds(blueprint, { catalog, pi: PI });
    expect(ids.sort((a, b) => a - b)).toEqual([
      34, 40, 41, 42, 43, 2267, 2398, 9840, 9841, 9843, 9844, 9845,
    ]);
  });

  it('skips the planetary widening when pi.json is unavailable', () => {
    const ids = buildPlanTypeIds(blueprint, { catalog, pi: null });
    expect(ids.sort((a, b) => a - b)).toEqual([
      34, 40, 41, 42, 43, 2398, 9840, 9841, 9843, 9844, 9845,
    ]);
  });
});

describe('acquisitionForLookup', () => {
  const ctx: SubBuildContext = {
    facility: FACILITY_PRESETS.npcStation,
    rigFit: ['none', 'none', 'none'],
    security: 'highsec',
    systemCostIndex: 0.05,
    adjustedPrices: {},
    modifiers: NO_CHARACTER_MODIFIERS,
  };

  it('is a no-op — always null — when the caller never configured Blueprint Acquisition', () => {
    const acquisitionFor = acquisitionForLookup({ catalog, pi: PI, ownedBlueprints: [] });
    expect(acquisitionFor(9840, 5, ctx, { 34: 10 })).toBeNull();
  });

  it('is null for a typeID nothing in the SDE produces (a planetary output, or a raw material)', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [],
      blueprintAcquisition: { offersFor: () => [], hubPrices: {} },
    });
    expect(acquisitionFor(34, 5, ctx, {})).toBeNull();
    expect(acquisitionFor(2398, 5, ctx, {})).toBeNull();
  });

  it('resolves a manufacturing node via the BPO sell-price cascade when nothing is owned and no BPC offer exists', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [],
      blueprintAcquisition: { offersFor: () => [], hubPrices: { 9841: 777 } },
    });
    const result = acquisitionFor(9840, 5, ctx, { 34: 10 });
    expect(result).toMatchObject({
      me: 0,
      te: 0,
      blueprintTypeID: 9841,
      line: { unitPrice: 777, owned: false },
    });
  });

  it('quotes the ME the character actually owns when it is the cheapest tier', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [
        {
          item_id: 1,
          type_id: 9841,
          runs: -1,
          material_efficiency: 8,
          time_efficiency: 16,
          quantity: 1,
          location_id: 1,
          location_flag: 'Hangar',
        },
      ],
      blueprintAcquisition: { offersFor: () => [], hubPrices: {} },
    });
    const result = acquisitionFor(9840, 5, ctx, { 34: 10 });
    expect(result).toEqual({ me: 8, te: 16, blueprintTypeID: 9841, line: null });
  });

  it('never searches BPC Sourcing for a reaction formula — BPO-only, even when an offer would be cheaper', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [],
      blueprintAcquisition: {
        offersFor: () => [{ me: 0, te: 0, runs: 1, quantity: 1, price: 1 }],
        hubPrices: { 46156: 999 },
      },
    });
    const result = acquisitionFor(16667, 5, ctx, { 16650: 10 });
    expect(result).toMatchObject({
      me: 0,
      te: 0,
      blueprintTypeID: 46156,
      line: { unitPrice: 999, owned: false },
    });
  });

  it('honors a pilot-forced tier override over the cheapest owned tier (issue #839)', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [
        {
          item_id: 1,
          type_id: 9841,
          runs: -1,
          material_efficiency: 0,
          time_efficiency: 0,
          quantity: 1,
          location_id: 1,
          location_flag: 'Hangar',
        },
        {
          item_id: 2,
          type_id: 9841,
          runs: 10,
          material_efficiency: 8,
          time_efficiency: 16,
          quantity: 1,
          location_id: 1,
          location_flag: 'Hangar',
        },
      ],
      blueprintAcquisition: {
        offersFor: () => [],
        hubPrices: {},
        sourcing: { 9841: { acquisitionTierOverride: { me: 8, te: 16 } } },
      },
    });
    const result = acquisitionFor(9840, 5, ctx, { 34: 10 });
    expect(result).toMatchObject({
      me: 8,
      te: 16,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });
  });

  it('resolves a pilot-forced tier the character owns no matching copy of — an invisible copy, priced only by overridePrice', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [],
      blueprintAcquisition: {
        offersFor: () => [],
        hubPrices: {},
        sourcing: { 9841: { acquisitionTierOverride: { me: 10, te: 20 } } },
      },
    });
    const result = acquisitionFor(9840, 5, ctx, { 34: 10 });
    expect(result).toEqual({
      me: 10,
      te: 20,
      blueprintTypeID: 9841,
      line: { unitPrice: null, owned: false },
    });
  });

  it('pools owned copies across two branches needing the same blueprint type (issue #860) — only one branch gets the free/owned line', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [
        {
          item_id: 1,
          type_id: 9841,
          runs: 5,
          material_efficiency: 6,
          time_efficiency: 12,
          quantity: 1,
          location_id: 1,
          location_flag: 'Hangar',
        },
      ],
      blueprintAcquisition: { offersFor: () => [], hubPrices: { 9841: 777 } },
    });

    const branchA = acquisitionFor(9840, 25, ctx, { 34: 10 });
    expect(branchA).toMatchObject({
      me: 6,
      te: 12,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });

    const branchB = acquisitionFor(9840, 25, ctx, { 34: 10 });
    expect(branchB).toMatchObject({
      me: 0,
      te: 0,
      blueprintTypeID: 9841,
      line: { unitPrice: 777, owned: false },
    });

    expect(acquisitionFor(9840, 25, ctx, { 34: 10 })?.line).toBeNull();
  });

  it('counts the runs a node needs, not its units, against an owned copy', () => {
    const acquisitionFor = acquisitionForLookup({
      catalog,
      pi: PI,
      ownedBlueprints: [
        {
          item_id: 1,
          type_id: 9841,
          runs: 2,
          material_efficiency: 6,
          time_efficiency: 12,
          quantity: 1,
          location_id: 1,
          location_flag: 'Hangar',
        },
      ],
      blueprintAcquisition: { offersFor: () => [], hubPrices: { 9841: 777 } },
    });
    expect(acquisitionFor(9840, 10, ctx, { 34: 10 })?.line).toMatchObject({
      unitPrice: 0,
      owned: true,
    });
  });

  it('does not pool across two different acquisitionForLookup closures (unrelated resolution passes)', () => {
    const owned = [
      {
        item_id: 1,
        type_id: 9841,
        runs: 5,
        material_efficiency: 6,
        time_efficiency: 12,
        quantity: 1,
        location_id: 1,
        location_flag: 'Hangar',
      },
    ] as const;
    const sources = {
      catalog,
      pi: PI,
      ownedBlueprints: owned,
      blueprintAcquisition: { offersFor: () => [], hubPrices: { 9841: 777 } },
    };

    expect(acquisitionForLookup(sources)(9840, 5, ctx, { 34: 10 })).toMatchObject({
      me: 6,
      te: 12,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });
    expect(acquisitionForLookup(sources)(9840, 5, ctx, { 34: 10 })).toMatchObject({
      me: 6,
      te: 12,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });
  });

  it("cloneBlueprintPools lets two independent closures share the top-level claim without sharing each other's further claims (Group Owned Overlay, issue #860)", () => {
    const sources = {
      catalog,
      pi: PI,
      ownedBlueprints: [
        {
          item_id: 1,
          type_id: 9841,
          runs: 10,
          material_efficiency: 6,
          time_efficiency: 12,
          quantity: 1,
          location_id: 1,
          location_flag: 'Hangar',
        },
      ],
      blueprintAcquisition: { offersFor: () => [], hubPrices: { 9841: 777 } },
    };

    const sharedPools: BlueprintTierPools = new Map();
    const forTopLevel = acquisitionForLookup(sources, sharedPools);
    const topLevel = forTopLevel(9840, 3, ctx, { 34: 10 });
    expect(topLevel).toMatchObject({
      me: 6,
      te: 12,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });

    const poolsForPassA = cloneBlueprintPools(sharedPools);
    const poolsForPassB = cloneBlueprintPools(sharedPools);
    const forPassA = acquisitionForLookup(sources, poolsForPassA);
    const forPassB = acquisitionForLookup(sources, poolsForPassB);

    expect(forPassA(9840, 7, ctx, { 34: 10 })).toMatchObject({
      me: 6,
      te: 12,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });

    expect(forPassB(9840, 7, ctx, { 34: 10 })).toMatchObject({
      me: 6,
      te: 12,
      blueprintTypeID: 9841,
      line: { unitPrice: 0, owned: true },
    });
  });
});
