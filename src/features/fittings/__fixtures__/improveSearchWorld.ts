/**
 * Test-only: the Improve search's ports over the real engine and SDE
 * (`computeFittingStats`, an All-V pilot) with a fixed price for every type,
 * and the catalogue built from public/data, so `runImproveSearch` runs whole.
 */
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import type { CandidateRack } from '@/engine/fittings/candidates';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import type { MetaGroupNameMap, VariationTypeMap } from '@/engine/market/variations';
import { computeFittingStats } from '../dogmaFittingEngine';
import type { ImproveRequest, ImproveSearchPorts } from '../improveSearch';
import type { FittingCatalogue } from '../useFittingCatalogue';
import { loadRealDogmaEngine } from './realDogmaEngine';

const require = createRequire(import.meta.url);
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(require.resolve(`../../../../public/data/${path}`), 'utf8')) as T;

/** Every type's price in the fixed price map. */
export const PRICE = 1_000_000;
/** What every test fit costs. */
export const FIT_TOTAL = 50_000_000;

export type Racks = Partial<Record<FittingSlotKind, string[]>>;

export async function loadImproveSearchWorld() {
  const engine = await loadRealDogmaEngine();
  const [types, rackOf, marketTypes, variations, skills] = await Promise.all([
    readJson<FittingCatalogue['types']>('types.json'),
    readJson<Record<string, CandidateRack>>('fittingSlots.json'),
    readJson<{ typeId: number }[]>('market/types.json'),
    readJson<{ types: VariationTypeMap; metaGroups: MetaGroupNameMap }>('market/variations.json'),
    readJson<{ typeID: number }[]>('skills.json'),
  ]);
  const pilot = buildAllVProfile(skills.map((skill) => skill.typeID));
  const idOf = new Map(Object.entries(types).map(([typeId, type]) => [type.name, Number(typeId)]));
  const id = (name: string) => {
    const found = idOf.get(name);
    if (found === undefined) throw new Error(`no type named ${name}`);
    return found;
  };
  const typeIdsByGroup = new Map<number, number[]>();
  for (const [typeId, type] of Object.entries(types))
    typeIdsByGroup.set(type.groupID, [...(typeIdsByGroup.get(type.groupID) ?? []), Number(typeId)]);
  const catalogue = {
    types,
    rackOf,
    marketTypes,
    typeIdsByGroup,
    variations,
  } as unknown as FittingCatalogue;

  const fit = (ship: string, racks: Racks): Fitting =>
    ({
      name: ship,
      shipTypeId: id(ship),
      modules: (Object.entries(racks) as [FittingSlotKind, string[]][]).flatMap(([slot, names]) =>
        names.map((name, slotIndex) => ({ slot, slotIndex, state: 'active', typeId: id(name) }))
      ),
      drones: [],
      cargo: [],
    }) as unknown as Fitting;

  const stats = (fitting: Fitting): Promise<FittingStats> =>
    computeFittingStats(fitting, pilot, undefined, undefined, { overheated: false });

  const ports = (fitting: Fitting): ImproveSearchPorts => ({
    baseline: () => stats(fitting),
    stats: (variant) => stats(variant),
    concurrency: () => 1,
    fitCheck: (slot, typeId) =>
      engine.checkCandidates(fitting.shipTypeId, slot, [typeId], pilot).get(typeId),
    chargeGroups: (slot, typeId) => engine.chargeGroupIdsFor(fitting.shipTypeId, slot, typeId),
    prices: async () => () => PRICE,
    fitTotal: async () => FIT_TOTAL,
    commonality: async () => null,
  });

  const request = (
    fitting: Fitting,
    goal: ImproveRequest['goal'],
    config: Partial<ImproveRequest['config']> = {}
  ): ImproveRequest => ({
    fitting,
    catalogue,
    goal,
    hull: { typeId: fitting.shipTypeId, groupId: types[String(fitting.shipTypeId)]!.groupID },
    target: undefined,
    chargePlan: [],
    config: {
      job: 'pve',
      space: 'dangerous',
      noPropulsion: false,
      reach: 'upgrade',
      iskBudget: null,
      defense: 'keep',
      includeRigs: false,
      includeOfficer: false,
      allowMutated: false,
      oreFamily: 'Simple Asteroid',
      hold: 'cargo',
      ...config,
    },
  });

  return { id, fit, ports, request, variations };
}
