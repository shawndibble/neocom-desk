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
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { computeFittingStats } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';

const require = createRequire(import.meta.url);
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;

const ABYSSAL_DAMAGE_CONTROL = 52227;
const DAMAGE_CONTROL_II = 2048;
const DAMAGE_CONTROL_MUTAPLASMID = 52224;
const CPU = 50;

const RACKS: Record<FittingSlotKind, string[]> = {
  low: [
    'Inertial Stabilizers II',
    'Limited Hyperspatial Accelerator',
    'Damage Control II',
    'Warp Core Stabilizer II',
  ],
  medium: ['5MN Microwarpdrive II', 'Small Shield Extender II', 'Cargo Scanner II'],
  high: ['Covert Ops Cloaking Device II'],
  rig: ['Small Hyperspatial Velocity Optimizer II'],
  subsystem: [],
};

describe('Improve and a rolled Abyssal Damage Control (real engine, #5800)', () => {
  it('counts the roll, proposes no swap of the mutated slot by default, and offers it once allowed', async () => {
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
    const fit = (mutated: boolean): Fitting =>
      ({
        name: 'Astero',
        shipTypeId: id('Astero'),
        modules: (Object.entries(RACKS) as [FittingSlotKind, string[]][]).flatMap(([slot, names]) =>
          names.map((name, slotIndex) => ({
            slot,
            slotIndex,
            state: 'active',
            typeId: name === 'Damage Control II' && mutated ? ABYSSAL_DAMAGE_CONTROL : id(name),
            ...(name === 'Damage Control II' && mutated
              ? {
                  mutation: {
                    baseTypeId: DAMAGE_CONTROL_II,
                    mutaplasmidTypeId: DAMAGE_CONTROL_MUTAPLASMID,
                    attributes: { [CPU]: 20 },
                  },
                }
              : {}),
          }))
        ),
        drones: [],
        cargo: [],
      }) as unknown as Fitting;
    const stats = (f: Fitting): Promise<FittingStats> =>
      computeFittingStats(f, pilot, undefined, undefined, { overheated: false });
    const fitting = fit(true);
    const before = await stats(fitting);
    // The rolled 20 CPU is in the recalculation, not the base module's 30.
    expect((await stats(fit(false))).cpuUsed - before.cpuUsed).toBe(10);

    const search = async (allowMutated: boolean) => {
      const candidates = improveCandidates(
        fitting.modules,
        buildVariationIndex(variations.types, variations.metaGroups),
        rackOf,
        {
          goal: 'tank',
          reach: 'rebalance',
          allowMutated,
          slotCounts: before.slotCounts,
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
        before,
        goal: 'tank',
        candidates,
        stats,
        priceOf: () => null,
      });
      return {
        candidates,
        rows: [...(result?.noDownside ?? []), ...(result?.tradeOffs ?? [])],
      };
    };

    const kept = await search(false);
    expect(kept.candidates.length).toBeGreaterThan(0);
    expect(kept.candidates.some((c) => c.fromTypeId === ABYSSAL_DAMAGE_CONTROL)).toBe(false);

    // Before the fix, Improve offered three rows for this slot at Rebalance, Tankier.
    const allowed = await search(true);
    expect(allowed.rows.some((o) => o.candidate.fromTypeId === ABYSSAL_DAMAGE_CONTROL)).toBe(true);
    expect(
      allowed.rows
        .filter((o) => o.candidate.fromTypeId === ABYSSAL_DAMAGE_CONTROL)
        .every((o) => o.candidate.losesRoll === true)
    ).toBe(true);
  });
});
