import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mutaplasmidLookup } from '@/engine/fittings/mutaplasmids';
import type { MutaplasmidData } from '@/sde/types';
import { setModuleMutation } from '@/engine/fittings/mutationEdit';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import type { Fitting, ItemMutation } from '@/engine/fittings/types';
import { computeFittingStats } from './dogmaFittingEngine';
import type { VariantEvaluator } from './evaluationBasis';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';
import {
  RANK_CAP,
  evaluateOwned,
  sortOwned,
  topByQuality,
  type OwnedItem,
} from './ownedMutationRanking';

const require = createRequire(import.meta.url);
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;

const GRAVID = 47831;
const GREMLIN_NEUT = 16475;
// attributes: capacitorNeed 6, power 30, maxRange 54, energyNeutralizerAmount 97
const rolled = (power: number): ItemMutation => ({
  baseTypeId: GREMLIN_NEUT,
  mutaplasmidTypeId: GRAVID,
  attributes: { 6: 419.25, 30: power, 54: 15680, 97: 591.36 },
});

let fitting: Fitting;
let lookup: ReturnType<typeof mutaplasmidLookup>;
let variants: VariantEvaluator;
const pilotOf = (skills: { typeID: number }[]) => buildAllVProfile(skills.map((s) => s.typeID));

beforeAll(async () => {
  await loadRealDogmaEngine();
  const [types, skills, data] = await Promise.all([
    readJson<Record<string, { name: string }>>('types.json'),
    readJson<{ typeID: number }[]>('skills.json'),
    readJson<MutaplasmidData>('mutaplasmids.json'),
  ]);
  lookup = mutaplasmidLookup(data);
  const hull = Object.entries(types).find(([, t]) => t.name === 'Vexor Navy Issue');
  if (!hull) throw new Error('no hull');
  fitting = {
    name: 'rank',
    shipTypeId: Number(hull[0]),
    modules: [{ slot: 'high', slotIndex: 0, typeId: GREMLIN_NEUT, state: 'active' }],
    drones: [],
    cargo: [],
  } as unknown as Fitting;
  const pilot = pilotOf(skills);
  const stats = (f: Fitting) =>
    computeFittingStats(f, pilot, undefined, undefined, { overheated: false });
  // The real engine, on the calling thread: the worker is the same calculation.
  variants = {
    fitting,
    compare: async (variant: Fitting) => ({
      before: await stats(fitting),
      after: await stats(variant),
    }),
  } as unknown as VariantEvaluator;
});

afterAll(() => vi.unstubAllGlobals());

const item = (itemId: number, power: number, quality: number): OwnedItem => ({
  itemId,
  mutation: rolled(power),
  quality,
});

describe('ranking owned abyssal modules through the real engine', () => {
  it('orders two modules of one type by what each does to the fit, not by quality', async () => {
    // Same type, different rolls: the lighter powergrid roll is the better fit
    // even though the heavier one has the higher quality.
    const heavy = item(1, 2000, 0.9);
    const light = item(2, 1400, 0.3);
    const effects = await evaluateOwned({
      variants,
      slot: 'high',
      slotIndex: 0,
      items: [heavy, light],
      lookup,
    });
    expect(effects.get(2)!.score).toBeGreaterThan(effects.get(1)!.score);
    expect(sortOwned([heavy, light], effects, 'effect').map((i) => i.itemId)).toEqual([2, 1]);
    expect(sortOwned([heavy, light], effects, 'quality').map((i) => i.itemId)).toEqual([1, 2]);
  });

  it('gives a row the figures the fit shows after the pick', async () => {
    const owned = item(3, 1500, 0.5);
    const effects = await evaluateOwned({
      variants,
      slot: 'high',
      slotIndex: 0,
      items: [owned],
      lookup,
    });
    const picked = setModuleMutation(fitting, 'high', 0, owned.mutation, lookup);
    const { before, after } = await variants.compare(picked);
    const { swapChanges } = await import('@/engine/fittings/swapChanges');
    expect(effects.get(3)!.delta).toEqual(swapChanges(before, after));
  });
});

describe('the evaluation cap', () => {
  it('keeps the best-rolled RANK_CAP of more matches', () => {
    const items = Array.from({ length: 12 }, (_, i) => item(i, 1700, i / 12));
    const top = topByQuality(items);
    expect(top).toHaveLength(RANK_CAP);
    expect(top.map((i) => i.itemId)).toEqual([11, 10, 9, 8, 7, 6, 5, 4]);
  });
});
