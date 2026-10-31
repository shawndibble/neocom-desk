import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { findImprovements, improveCandidates } from '@/engine/fittings/improve';
import {
  buildVariationIndex,
  type MetaGroupNameMap,
  type VariationTypeMap,
} from '@/engine/market/variations';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { computeFittingStats } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';

const require = createRequire(import.meta.url);
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;

import { swapChanges } from '@/engine/fittings/swapChanges';

/** Jita sell, 2026-10-30. Illustrative: only the order matters. */
const PRICES: Record<string, number> = {
  'Covert Ops Cloaking Device II': 100_000_000,
  'Prototype Cloaking Device I': 1_000_000,
};

describe('Warps cloaked on a cloak swap (real engine)', () => {
  it('names it lost going from a Covert Ops cloak to a Prototype one, in Variations and the Improve Gives up list', async () => {
    const engine = await loadRealDogmaEngine();
    const [types, rackOf, marketTypes, variations, skills] = await Promise.all([
      readJson<Record<string, { name: string; groupID: number }>>('types.json'),
      readJson<Record<string, CandidateRack>>('fittingSlots.json'),
      readJson<{ typeId: number }[]>('market/types.json'),
      readJson<{ types: VariationTypeMap; metaGroups: MetaGroupNameMap }>('market/variations.json'),
      readJson<{ typeID: number }[]>('skills.json'),
    ]);
    const pilot = buildAllVProfile(skills.map((skill) => skill.typeID));
    const idOf = new Map(Object.entries(types).map(([id, type]) => [type.name, Number(id)]));
    const id = (name: string) => {
      const found = idOf.get(name);
      if (found === undefined) throw new Error(`no type named ${name}`);
      return found;
    };
    const byGroup = new Map<number, number[]>();
    for (const [typeId, type] of Object.entries(types))
      byGroup.set(type.groupID, [...(byGroup.get(type.groupID) ?? []), Number(typeId)]);
    const listed = new Set(marketTypes.map((entry) => entry.typeId));
    const withCloak = (name: string) =>
      ({
        name: 'Astero',
        shipTypeId: id('Astero'),
        modules: [{ slot: 'high', slotIndex: 0, typeId: id(name), state: 'active' }],
        drones: [],
        cargo: [],
      }) as unknown as Fitting;
    const stats = (f: Fitting): Promise<FittingStats> =>
      computeFittingStats(f, pilot, undefined, undefined, { overheated: false });

    const covert = await stats(withCloak('Covert Ops Cloaking Device II'));
    const prototype = await stats(withCloak('Prototype Cloaking Device I'));
    expect(covert.explore.warpsCloaked).toBe(true);
    expect(prototype.explore.warpsCloaked).toBe(false);

    const lostWarp = { kind: 'stat', change: { key: 'warpsCloaked', before: 1, after: 0 } };
    expect(swapChanges(covert, prototype)).toContainEqual(lostWarp);

    const fitting = withCloak('Covert Ops Cloaking Device II');
    const candidates = improveCandidates(
      fitting.modules,
      buildVariationIndex(variations.types, variations.metaGroups),
      rackOf,
      {
        goal: 'cheaper',
        reach: 'upgrade',
        slotCounts: covert.slotCounts,
        pool: {
          groupOf: (typeId) => types[String(typeId)]?.groupID,
          typeIdsInGroup: (group) => byGroup.get(group) ?? [],
          published: (typeId) => listed.has(typeId),
          nameOf: (typeId) => types[String(typeId)]?.name,
          flyable: (slot, typeId) => {
            const check = engine
              .checkCandidates(fitting.shipTypeId, slot as CandidateRack, [typeId], pilot)
              .get(typeId);
            return check ? check.fitsHull && check.canFly : true;
          },
        },
      }
    );
    const result = await findImprovements({
      fitting,
      before: covert,
      goal: 'cheaper',
      candidates,
      stats,
      priceOf: (typeId) => PRICES[types[String(typeId)]?.name ?? ''] ?? null,
    });
    // Cheaper's keep-your-stats guardrail turns this swap down (the Prototype cloak slows the ship
    // more), so it sits among the closest swaps; its `lost` list is the Gives up either way.
    const option = [...(result?.tradeOffs ?? []), ...(result?.rejected ?? [])].find(
      (o) => o.candidate.toTypeId === id('Prototype Cloaking Device I')
    );
    expect(option?.lost.map((lost) => lost.change)).toContainEqual({
      key: 'warpsCloaked',
      before: 1,
      after: 0,
    });
  });
});
