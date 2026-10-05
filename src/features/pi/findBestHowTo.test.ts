import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { PiData } from '@/sde/types';
import type { RecipeRank } from '@/engine/pi/planRecipes';
import { buildHowTo, setupParts } from './findBestHowTo';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;
const idOf = (name: string) =>
  Number(Object.entries(pi.schematics).find(([, s]) => s.name === name)?.[0]);
const rawId = (name: string) => pi.raw.find((r) => r.name === name)?.typeID ?? 0;

const silicon = idOf('Silicon');
const recipe = (over: Partial<RecipeRank> = {}): RecipeRank => ({
  typeId: silicon,
  name: 'Silicon',
  tier: 1,
  iskPerDay: 100,
  m3PerDay: 10,
  useType: 'lava',
  hostTypes: ['lava'],
  haveTypes: [],
  comparison: null,
  layout: {
    unitsPerDay: 240,
    pins: { extractorControlUnit: 1, basic: 2, launchpad: 1 },
    extracts: [rawId('Felsic Magma')],
    makes: [{ typeId: silicon, facility: 'basic' }],
  },
  ...over,
});

describe('buildHowTo', () => {
  it('lists the pins, the chain and a week of output', () => {
    const how = buildHowTo(recipe(), pi);
    expect(how).not.toBeNull();
    expect(how?.launchpads).toBe(1);
    expect(how?.extractors.map((e) => e.name)).toEqual(['Felsic Magma']);
    expect(how?.factories).toEqual([
      { kind: 'basic', count: 2, makes: [{ typeId: silicon, name: 'Silicon' }] },
    ]);
    expect(how?.chain).toEqual({ raws: [rawId('Felsic Magma')], processed: [], product: silicon });
    expect(how?.unitsPerWeek).toBe(1680);
    expect(how?.m3PerWeek).toBe(70);
  });

  it('names the lowest Command Center level that hosts the layout', () => {
    const how = buildHowTo(recipe(), pi);
    expect(how?.fit).not.toBeNull();
    const fit = how!.fit!;
    expect(fit.used.cpu).toBeLessThanOrEqual(fit.budget.cpu);
    expect(fit.used.powergrid).toBeLessThanOrEqual(fit.budget.powergrid);
  });

  it('has nothing to show without a layout', () => {
    expect(buildHowTo(recipe({ layout: undefined }), pi)).toBeNull();
  });

  it('reads a P2 as raws, then processed inputs, then the product', () => {
    const coolant = idOf('Coolant');
    const electrolytes = idOf('Electrolytes');
    const water = idOf('Water');
    const how = buildHowTo(
      recipe({
        typeId: coolant,
        tier: 2,
        layout: {
          unitsPerDay: 10,
          pins: { extractorControlUnit: 2, basic: 2, advanced: 1, launchpad: 1 },
          extracts: [rawId('Noble Gas'), rawId('Aqueous Liquids')],
          makes: [
            { typeId: electrolytes, facility: 'basic' },
            { typeId: water, facility: 'basic' },
            { typeId: coolant, facility: 'advanced' },
          ],
        },
      }),
      pi
    );
    expect(how?.chain.processed).toEqual([electrolytes, water]);
    expect(how?.factories.map((f) => f.kind)).toEqual(['basic', 'advanced']);
  });
});

describe('setupParts', () => {
  it('counts extractors and factories, zero when absent', () => {
    expect(setupParts({ extractorControlUnit: 2, basic: 2, advanced: 1 })).toEqual({
      extractors: 2,
      basic: 2,
      advanced: 1,
      highTech: 0,
    });
  });
});
