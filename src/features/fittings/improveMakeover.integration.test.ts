import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import {
  findMakeover,
  makeoverMoves,
  type MakeoverSearch,
} from '@/engine/fittings/improveMakeover';
import { fitsResourceBudget } from '@/engine/fittings/skillGaps';
import {
  buildVariationIndex,
  type MetaGroupNameMap,
  type VariationTypeMap,
} from '@/engine/market/variations';
import type {
  Fitting,
  FittingModule,
  FittingSlotKind,
  FittingStats,
  PilotProfile,
} from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { computeFittingStats, type DogmaEngine } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';

const require = createRequire(import.meta.url);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;
}

/** Module groups the fit puts in an active state: shield hardeners, propulsion, shield boosters. */
const ACTIVE_GROUPS = new Set([77, 46, 40]);
/** Shield hardeners (active) and shield resistance amplifiers (passive): the score may pick either. */
const SHIELD_RESIST_GROUPS = new Set([77, 295]);

/**
 * The PvE Drake from issue #5548. A hand review turned it into: Damage Control
 * and three Ballistic Controls in the lows, three extenders, two hardeners and
 * an afterburner in the mids, three Core Defense Field Extender rigs.
 */
const LOWS = [
  'Shield Power Relay II',
  'Shield Power Relay II',
  'Ballistic Control System II',
  'Ballistic Control System II',
];
const MIDS = [
  'Large Shield Extender II',
  'Large Shield Extender II',
  'Large Shield Extender II',
  'Multispectrum Shield Hardener II',
  'Missile Guidance Computer II',
  'Missile Guidance Computer II',
];
const RIG = 'Medium Core Defense Field Purger II';

describe('Improve makeover on a PvE Drake (real WASM + real pinned SDE)', () => {
  let engine: DogmaEngine;
  let pilot: PilotProfile;
  let types: Record<string, { name: string; groupID: number }>;
  let drake: Fitting;
  let search: MakeoverSearch | null;

  beforeAll(async () => {
    engine = await loadRealDogmaEngine();
    const [typeMap, rackOf, marketTypes, variations, skills] = await Promise.all([
      readJson<Record<string, { name: string; groupID: number }>>('types.json'),
      readJson<Record<string, CandidateRack>>('fittingSlots.json'),
      readJson<{ typeId: number }[]>('market/types.json'),
      readJson<{ types: VariationTypeMap; metaGroups: MetaGroupNameMap }>('market/variations.json'),
      readJson<{ typeID: number }[]>('skills.json'),
    ]);
    types = typeMap;
    pilot = buildAllVProfile(skills.map((skill) => skill.typeID));
    const idOf = new Map(Object.entries(types).map(([id, type]) => [type.name, Number(id)]));
    const id = (name: string) => {
      const found = idOf.get(name);
      if (found === undefined) throw new Error(`no type named ${name}`);
      return found;
    };
    const module = (slot: FittingSlotKind, slotIndex: number, name: string): FittingModule => {
      const typeId = id(name);
      const active = slot === 'high' || ACTIVE_GROUPS.has(types[String(typeId)].groupID);
      return {
        slot,
        slotIndex,
        typeId,
        state: active ? 'active' : 'online',
        ...(slot === 'high' ? { chargeTypeId: id('Scourge Rage Heavy Assault Missile') } : {}),
      } as FittingModule;
    };
    drake = {
      name: 'Drake 2022',
      shipTypeId: id('Drake'),
      modules: [
        ...LOWS.map((name, i) => module('low', i, name)),
        ...MIDS.map((name, i) => module('medium', i, name)),
        ...Array.from({ length: 6 }, (_, i) =>
          module('high', i, 'Heavy Assault Missile Launcher II')
        ),
        ...[0, 1, 2].map((i) => module('rig', i, RIG)),
      ],
      drones: [{ typeId: id('Hornet II'), quantity: 5, state: 'active' }],
      cargo: [],
    } as unknown as Fitting;

    const typeIdsByGroup = new Map<number, number[]>();
    for (const [typeId, type] of Object.entries(types)) {
      const ids = typeIdsByGroup.get(type.groupID) ?? [];
      ids.push(Number(typeId));
      typeIdsByGroup.set(type.groupID, ids);
    }
    const listed = new Set(marketTypes.map((entry) => entry.typeId));
    const index = buildVariationIndex(variations.types, variations.metaGroups);
    const stats = (fitting: Fitting): Promise<FittingStats> =>
      computeFittingStats(fitting, pilot, undefined, undefined, { overheated: false });
    const before = await stats(drake);
    search = await findMakeover({
      fitting: drake,
      before,
      goal: 'overall',
      moves: (fitting) =>
        makeoverMoves(fitting.modules, index, rackOf, {
          goal: 'overall',
          defense: 'keep',
          includeRigs: true,
          slotCounts: before.slotCounts,
          pool: {
            groupOf: (typeId) => types[String(typeId)]?.groupID,
            typeIdsInGroup: (group) => typeIdsByGroup.get(group) ?? [],
            published: (typeId) => listed.has(typeId),
            flyable: (slot, typeId) => {
              const check = engine
                .checkCandidates(drake.shipTypeId, slot as CandidateRack, [typeId], pilot)
                .get(typeId);
              return check ? check.fitsHull && check.canFly : true;
            },
          },
        }),
      stats,
      priceOf: () => null,
    });
  }, 60_000);
  afterAll(() => vi.unstubAllGlobals());

  const named = (rack: FittingSlotKind) =>
    search?.makeover?.fitting.modules
      .filter((m) => m.slot === rack)
      .map((m) => types[String(m.typeId)].name) ?? [];

  it('finds a makeover that stays within budget and cap-stable', () => {
    const makeover = search?.makeover;
    expect(makeover).toBeTruthy();
    expect(makeover && fitsResourceBudget(makeover.after)).toBe(true);
    expect(makeover?.after.capacitor.stable).toBe(true);
  });

  it('fits a Damage Control in the lows', () => {
    expect(named('low')).toContain('Damage Control II');
  });

  it('keeps the three Large Shield Extender II and has at least two shield resist modules', () => {
    expect(named('medium').filter((name) => name === 'Large Shield Extender II')).toHaveLength(3);
    const resists = search?.makeover?.fitting.modules.filter(
      (m) => m.slot === 'medium' && SHIELD_RESIST_GROUPS.has(types[String(m.typeId)].groupID)
    );
    expect(resists?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('swaps the Core Defense Field Purger rigs', () => {
    expect(named('rig')).not.toContain(RIG);
  });
});
