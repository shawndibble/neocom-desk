import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import { swapChanges } from '@/engine/fittings/swapChanges';
import type { Fitting, FittingSlotKind, FittingStats } from '@/engine/fittings/types';
import { computeFittingStats } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';

const require = createRequire(import.meta.url);
const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;

type Rack = Partial<Record<FittingSlotKind, string[]>>;

let idOf: Map<string, number>;
let pilot: ReturnType<typeof buildAllVProfile>;

beforeAll(async () => {
  await loadRealDogmaEngine();
  const [types, skills] = await Promise.all([
    readJson<Record<string, { name: string }>>('types.json'),
    readJson<{ typeID: number }[]>('skills.json'),
  ]);
  idOf = new Map(Object.entries(types).map(([id, type]) => [type.name, Number(id)]));
  pilot = buildAllVProfile(skills.map((skill) => skill.typeID));
});

const id = (name: string) => {
  const found = idOf.get(name);
  if (found === undefined) throw new Error(`no type named ${name}`);
  return found;
};

async function stats(ship: string, rack: Rack, drones: string[] = []): Promise<FittingStats> {
  const fitting = {
    name: ship,
    shipTypeId: id(ship),
    modules: (Object.entries(rack) as [FittingSlotKind, string[]][]).flatMap(([slot, names]) =>
      names.map((entry, slotIndex) => {
        // `Module + Charge` loads a charge.
        const [name, charge] = entry.split(' + ');
        return {
          slot,
          slotIndex,
          typeId: id(name),
          state: 'active',
          ...(charge ? { chargeTypeId: id(charge) } : {}),
        };
      })
    ),
    drones: drones.map((name) => ({ typeId: id(name), quantity: 3, state: 'active' })),
    cargo: [],
  } as unknown as Fitting;
  return computeFittingStats(fitting, pilot, undefined, undefined, { overheated: false });
}

/** The keys a swap names, with the figure each went from and to. */
function named(before: FittingStats, after: FittingStats) {
  return Object.fromEntries(
    swapChanges(before, after).map(({ change }) => [change.key, [change.before, change.after]])
  );
}

describe('swap figures through the real engine', () => {
  it('names a drone nav computer swap as drone speed only when the speed moves', async () => {
    const rack = (computer: string): Rack => ({ low: [computer] });
    const slow = await stats('Vexor', rack('Drone Navigation Computer I'), ['Hammerhead II']);
    const fast = await stats('Vexor', rack('Drone Navigation Computer II'), ['Hammerhead II']);
    const changes = named(slow, fast);
    expect(changes.droneSpeed?.[1]).toBeGreaterThan(changes.droneSpeed?.[0] ?? Infinity);
    expect(named(slow, slow)).toEqual({});
    // A fit without drones never shows one.
    const bare = await stats('Vexor', rack('Drone Navigation Computer I'));
    expect(named(bare, bare).droneSpeed).toBeUndefined();
  });

  it('names a salvager swap as chance and range', async () => {
    const one = await stats('Vexor', { high: ['Salvager I'] });
    const two = await stats('Vexor', { high: ['Salvager II'] });
    const changes = named(one, two);
    expect(changes.salvageChance?.[1]).toBeGreaterThan(changes.salvageChance?.[0] ?? Infinity);
    expect(named(one, one)).toEqual({});
  });

  it('names a micro jump drive as a reactivation delay, never as lost when added', async () => {
    const none = await stats('Vexor', { medium: ['Warp Scrambler II'] });
    const mjd = await stats('Vexor', { medium: ['Medium Micro Jump Drive'] });
    const delay = named(none, mjd).reactivationDelay;
    expect(delay?.[0]).toBe(0);
    expect(delay?.[1]).toBeGreaterThan(0);
  });

  it('names a missile guidance computer swap as explosion velocity and radius', async () => {
    const launcher = ['Heavy Missile Launcher II + Scourge Heavy Missile'];
    const fit = (computer: string) => stats('Caracal', { high: launcher, medium: [computer] });
    const one = await fit('Missile Guidance Computer I');
    const two = await fit('Missile Guidance Computer II');
    const changes = named(one, two);
    expect(changes.missileExplosionVelocity?.[1]).toBeGreaterThan(
      changes.missileExplosionVelocity?.[0] ?? Infinity
    );
    expect(changes.missileExplosionRadius?.[1]).toBeLessThan(
      changes.missileExplosionRadius?.[0] ?? -Infinity
    );
  });
});
