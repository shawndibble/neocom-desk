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

/** Jita sell, 2026-10-30. */
const PRICES: Record<string, number> = {
  'Zeugma Integrated Analyzer': 536_900_000,
  'Ligature Integrated Analyzer': 249_800_000,
  // Illustrative: only the order matters.
  'Sisters Core Probe Launcher': 20_000_000,
  'Core Probe Launcher I': 30_000,
};

/** The Astero a pilot asked about: Cheaper offered nothing for its 537M Zeugma. */
const RACKS: Record<FittingSlotKind, string[]> = {
  low: [
    'Inertial Stabilizers II',
    'Limited Hyperspatial Accelerator',
    'Damage Control II',
    'Warp Core Stabilizer II',
  ],
  medium: [
    '5MN Microwarpdrive II',
    'Small Shield Extender II',
    'Cargo Scanner II',
    'Zeugma Integrated Analyzer',
  ],
  high: ['Covert Ops Cloaking Device II', 'Sisters Core Probe Launcher'],
  rig: [
    'Small Hyperspatial Velocity Optimizer II',
    'Small Low Friction Nozzle Joints II',
    'Small Hyperspatial Velocity Optimizer II',
  ],
  subsystem: [],
};

describe('Cheaper on an exploration Astero (real engine)', () => {
  it('offers Ligature for the Zeugma as a trade-off that names the data and relic strength lost', async () => {
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
    const fitting = {
      name: 'Astero',
      shipTypeId: id('Astero'),
      modules: (Object.entries(RACKS) as [FittingSlotKind, string[]][]).flatMap(([slot, names]) =>
        names.map((name, slotIndex) => ({ slot, slotIndex, typeId: id(name), state: 'active' }))
      ),
      drones: [{ typeId: id('Hornet EC-300'), quantity: 4, state: 'active' }],
      cargo: [],
    } as unknown as Fitting;
    const stats = (f: Fitting): Promise<FittingStats> =>
      computeFittingStats(f, pilot, undefined, undefined, { overheated: false });
    const before = await stats(fitting);
    const candidates = improveCandidates(
      fitting.modules,
      buildVariationIndex(variations.types, variations.metaGroups),
      rackOf,
      {
        goal: 'cheaper',
        reach: 'upgrade',
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
      goal: 'cheaper',
      candidates,
      stats,
      priceOf: (typeId) => PRICES[types[String(typeId)]?.name ?? ''] ?? null,
    });

    const ligature = result?.tradeOffs.find(
      (option) => option.candidate.toTypeId === id('Ligature Integrated Analyzer')
    );
    expect(ligature?.iskDelta).toBe(-287_100_000);
    // An Integrated Analyzer opens both sites, so both strengths drop.
    for (const key of ['dataStrength', 'relicStrength']) {
      const strength = ligature?.lost.find((lost) => lost.change.key === key);
      expect(strength?.change.before).toBeGreaterThan(strength?.change.after ?? Infinity);
    }
    expect(result?.noDownside.map((option) => option.candidate.toTypeId)).not.toContain(
      id('Ligature Integrated Analyzer')
    );

    // The launcher is empty (the probes are in cargo), so its own bonus is what is lost.
    const launcher = result?.tradeOffs.find(
      (option) => option.candidate.toTypeId === id('Core Probe Launcher I')
    );
    expect(launcher?.lost.map((lost) => lost.change)).toContainEqual({
      key: 'probeLauncherBonus',
      before: 10,
      after: 0,
    });
  });
});
