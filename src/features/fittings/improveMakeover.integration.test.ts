import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { buildAllVProfile } from '@/engine/fittings/pilotProfile';
import {
  findMakeover,
  makeoverMoves,
  propulsionStart,
  type MakeoverMoveOptions,
  type MakeoverSearch,
} from '@/engine/fittings/improveMakeover';
import type { JobCommonality } from '@/engine/fittings/hullCommonality';
import { damageOf, scoreOf, type ImproveGoal } from '@/engine/fittings/improve';
import { jobSettingOf, type ExploreSpace, type ImproveJob } from '@/engine/fittings/improveJob';
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
} from '@/engine/fittings/types';
import type { CandidateRack } from '@/engine/fittings/candidates';
import { computeFittingStats } from './dogmaFittingEngine';
import { loadRealDogmaEngine } from './__fixtures__/realDogmaEngine';

const require = createRequire(import.meta.url);

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(require.resolve(`../../../public/data/${path}`), 'utf8')) as T;
}

const SHIELD_HARDENER = 77;
/** Hacking and scanning rigs: the Memetic, Emission, Gravity and Signal rigs. */
const SCANNING_RIGS = 1233;

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

type TypeMap = Record<string, { name: string; groupID: number }>;

/** The real engine, the pinned SDE and an All-V pilot: what every case below shares. */
async function loadWorld() {
  const engine = await loadRealDogmaEngine();
  const [types, rackOf, marketTypes, variations, skills] = await Promise.all([
    readJson<TypeMap>('types.json'),
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
  for (const [typeId, type] of Object.entries(types)) {
    const ids = typeIdsByGroup.get(type.groupID) ?? [];
    ids.push(Number(typeId));
    typeIdsByGroup.set(type.groupID, ids);
  }
  const listed = new Set(marketTypes.map((entry) => entry.typeId));
  const index = buildVariationIndex(variations.types, variations.metaGroups);
  const stats = (fitting: Fitting): Promise<FittingStats> =>
    computeFittingStats(fitting, pilot, undefined, undefined, { overheated: false });
  const search = async (
    fitting: Fitting,
    job?: { job: ImproveJob; space?: ExploreSpace; noPropulsion?: boolean },
    goal: ImproveGoal = 'overall',
    commonality?: JobCommonality | null
  ): Promise<{ before: FittingStats; result: MakeoverSearch | null }> => {
    const before = await stats(fitting);
    const jobSetting = job ? jobSettingOf(job.job, job.space, job.noPropulsion) : undefined;
    const options: MakeoverMoveOptions = {
      goal,
      defense: 'keep',
      includeRigs: true,
      ...(jobSetting ? { jobSetting } : {}),
      commonality,
      slotCounts: before.slotCounts,
      pool: {
        groupOf: (typeId) => types[String(typeId)]?.groupID,
        typeIdsInGroup: (group) => typeIdsByGroup.get(group) ?? [],
        published: (typeId) => listed.has(typeId),
        nameOf: (typeId) => types[String(typeId)]?.name,
        flyable: (slot, typeId) => {
          const check = engine
            .checkCandidates(fitting.shipTypeId, slot as CandidateRack, [typeId], pilot)
            .get(typeId);
          return check ? check.fitsHull && check.canFly : true;
        },
      },
    };
    const result = await findMakeover({
      fitting,
      before,
      goal,
      ...(jobSetting ? { jobSetting } : {}),
      moves: (current) => makeoverMoves(current.modules, index, rackOf, options),
      propulsion: propulsionStart(index, rackOf, options),
      stats,
      priceOf: () => null,
    });
    return { before, result };
  };
  return { types, id, search, stats };
}

const fitModule = (
  id: (name: string) => number,
  slot: FittingSlotKind,
  slotIndex: number,
  name: string
): FittingModule =>
  // Every loader marks modules active and the engine lowers a passive one (`eftLoader`).
  ({ slot, slotIndex, typeId: id(name), state: 'active' }) as FittingModule;

function drakeFit(id: (name: string) => number): Fitting {
  const module = (slot: FittingSlotKind, slotIndex: number, name: string) => ({
    ...fitModule(id, slot, slotIndex, name),
    ...(slot === 'high' ? { chargeTypeId: id('Scourge Rage Heavy Assault Missile') } : {}),
  });
  return {
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
}

/** The Drake's PvE commonality from the Workbench fixture (`hullCommonality.realData.test.ts`): 14 fits, 6 afterburner, 5 MWD. */
const DRAKE_PVE: JobCommonality = {
  fits: 14,
  groupShare: new Map(),
  propulsion: { afterburner: 6 / 14, mwd: 5 / 14, mjd: 0 },
};
/** The Dominix's: 14 PvE fits, 10 with a micro jump drive, 5 afterburner, 3 MWD. */
const DOMINIX_PVE: JobCommonality = {
  fits: 14,
  groupShare: new Map(),
  propulsion: { afterburner: 5 / 14, mwd: 3 / 14, mjd: 10 / 14 },
};
const PROPULSION_GROUPS = [46, 1189];

describe('Improve makeover on a PvE Drake (real WASM + real pinned SDE)', () => {
  let types: TypeMap;
  let search: MakeoverSearch | null;
  let pveBefore: FittingStats;
  let pveSearch: MakeoverSearch | null;
  let pveCommon: MakeoverSearch | null;
  let optOut: MakeoverSearch | null;

  beforeAll(async () => {
    const world = await loadWorld();
    types = world.types;
    const drake = drakeFit(world.id);
    ({ result: search } = await world.search(drake));
    ({ before: pveBefore, result: pveSearch } = await world.search(drake, { job: 'pve' }));
    ({ result: pveCommon } = await world.search(drake, { job: 'pve' }, 'overall', DRAKE_PVE));
    ({ result: optOut } = await world.search(drake, { job: 'pve', noPropulsion: true }));
  }, 120_000);
  afterAll(() => vi.unstubAllGlobals());

  const named = (found: MakeoverSearch | null, rack: FittingSlotKind) =>
    found?.makeover?.fitting.modules
      .filter((m) => m.slot === rack)
      .map((m) => types[String(m.typeId)].name) ?? [];

  it('finds a makeover that stays within budget and cap-stable', () => {
    const makeover = search?.makeover;
    expect(makeover).toBeTruthy();
    expect(makeover && fitsResourceBudget(makeover.after)).toBe(true);
    expect(makeover?.after.capacitor.stable).toBe(true);
  });

  it('fits a Damage Control in the lows', () => {
    expect(named(search, 'low')).toContain('Damage Control II');
  });

  it('keeps at least three Large Shield Extender II and has at least two shield hardeners', () => {
    const extenders = named(search, 'medium').filter((name) => name === 'Large Shield Extender II');
    expect(extenders.length).toBeGreaterThanOrEqual(3);
    const hardeners = search?.makeover?.fitting.modules.filter(
      (m) => m.slot === 'medium' && types[String(m.typeId)].groupID === SHIELD_HARDENER
    );
    expect(hardeners?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('swaps the Core Defense Field Purger rigs', () => {
    expect(named(search, 'rig')).not.toContain(RIG);
  });

  describe('job PvE', () => {
    it('keeps damage within 10% of the open fit', () => {
      const makeover = pveSearch?.makeover;
      expect(makeover).toBeTruthy();
      const was = damageOf(pveBefore, undefined);
      expect(damageOf(makeover!.after, undefined)).toBeGreaterThanOrEqual(was * 0.9);
    });

    const propulsionOf = (found: MakeoverSearch | null) =>
      (found?.makeover?.fitting.modules ?? [])
        .filter((m) => PROPULSION_GROUPS.includes(types[String(m.typeId)].groupID))
        .map((m) => types[String(m.typeId)].name);

    it('adds a propulsion module, by score without data on the hull, and says why', () => {
      const names = propulsionOf(pveSearch);
      expect(names).toHaveLength(1);
      expect(names[0]).toMatch(/Afterburner|Microwarpdrive/);
      expect(pveSearch?.makeover?.rows.some((row) => row.addsPropulsionFor === 'pve')).toBe(true);
    });

    it('with the Drake commonality (mostly afterburners) adds an afterburner and keeps damage within 10%', () => {
      const names = propulsionOf(pveCommon);
      expect(names).toHaveLength(1);
      expect(names[0]).toMatch(/Afterburner/);
      expect(damageOf(pveCommon!.makeover!.after, undefined)).toBeGreaterThanOrEqual(
        damageOf(pveBefore, undefined) * 0.9
      );
    });

    it('with the opt-out adds none', () => {
      expect(propulsionOf(optOut)).toEqual([]);
    });

    it('still fits a Damage Control, at least two shield hardeners and the Extender rigs', () => {
      expect(named(pveSearch, 'low')).toContain('Damage Control II');
      const hardeners = pveSearch?.makeover?.fitting.modules.filter(
        (m) => m.slot === 'medium' && types[String(m.typeId)].groupID === SHIELD_HARDENER
      );
      expect(hardeners?.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(named(pveSearch, 'rig').some((name) => name.includes('Extender'))).toBe(true);
    });
  });
});

/** The relic and data Astero from the #5548 review, in the order its EFT lists them. */
const ASTERO = {
  low: [
    "'Stoic' Core Equalizer I",
    'Small Armor Repairer II',
    'Damage Control II',
    'Inertial Stabilizers II',
  ],
  medium: [
    '5MN Quad LiF Restrained Microwarpdrive',
    'Relic Analyzer II',
    'Data Analyzer II',
    'Scan Rangefinding Array II',
  ],
  high: ['Covert Ops Cloaking Device II', 'Sisters Core Probe Launcher'],
  rig: ['Small Inverted Signal Field Projector I', 'Small Low Friction Nozzle Joints II'],
};
const TANK = ['Small Armor Repairer II', 'Damage Control II'];
/** The explorer's kit by group: cloak, probe launcher, two analyzers, a propulsion module (a swap within a group is fine). */
const EXPLORER_GROUPS = new Map([
  [330, 1],
  [481, 1],
  [538, 2],
  [46, 1],
  // The 'Stoic' Core Equalizer: a warp core stabilizer, what gets it away when pointed.
  [315, 1],
]);

describe('Improve makeover on an Explore Astero (real WASM + real pinned SDE)', () => {
  let types: TypeMap;
  let astero: Fitting;
  let dangerous: MakeoverSearch | null;
  let safe: MakeoverSearch | null;

  beforeAll(async () => {
    const world = await loadWorld();
    types = world.types;
    astero = {
      name: 'Anomaly Astero',
      shipTypeId: world.id('Astero'),
      modules: Object.entries(ASTERO).flatMap(([slot, names]) =>
        names.map((name, i) => fitModule(world.id, slot as FittingSlotKind, i, name))
      ),
      drones: [],
      cargo: [],
    } as unknown as Fitting;
    dangerous = (await world.search(astero, { job: 'explore', space: 'dangerous' }, 'explore'))
      .result;
    safe = (await world.search(astero, { job: 'explore', space: 'safe' }, 'explore')).result;
  }, 90_000);

  /** The fit the search ends on; the open fit when it finds no Makeover. */
  const namesOf = (found: MakeoverSearch | null) =>
    (found?.makeover?.fitting ?? astero).modules.map((m) => types[String(m.typeId)].name);

  it.each([
    ['Dangerous', () => dangerous],
    ['Safe', () => safe],
  ])('%s keeps an MWD, never an afterburner', (_space, found) => {
    const names = (found()?.makeover?.fitting ?? astero).modules
      .filter((m) => types[String(m.typeId)].groupID === 46)
      .map((m) => types[String(m.typeId)].name);
    expect(names).toHaveLength(1);
    expect(names[0]).toMatch(/Microwarpdrive/);
  });

  it('Dangerous keeps Small Armor Repairer II and Damage Control II', () => {
    expect(namesOf(dangerous)).toEqual(expect.arrayContaining(TANK));
  });

  it.each([
    ['Dangerous', () => dangerous],
    ['Safe', () => safe],
  ])(
    '%s keeps the cloak, probe launcher, both analyzers and a propulsion module',
    (_space, found) => {
      const fit = found()?.makeover?.fitting ?? astero;
      for (const [group, count] of EXPLORER_GROUPS)
        expect(fit.modules.filter((m) => types[String(m.typeId)].groupID === group).length).toBe(
          count
        );
    }
  );

  it('Dangerous fits a hacking or scanning rig that the calibration allows', () => {
    const fit = dangerous?.makeover?.fitting ?? astero;
    const rigs = fit.modules.filter((m) => m.slot === 'rig').map((m) => types[String(m.typeId)]);
    expect(rigs.some((rig) => rig.groupID === SCANNING_RIGS)).toBe(true);
  });

  it('Safe does not guard the tank modules (any drop shows as lost)', () => {
    const lost = safe?.makeover?.lost ?? [];
    const dropped = TANK.some((name) => !namesOf(safe).includes(name));
    // A dropped tank module must be reported; keeping it is also allowed.
    expect(!dropped || lost.length > 0).toBe(true);
  });
});

describe('Explore score on the Astero rigs (real WASM + real pinned SDE)', () => {
  let scoreWith: (first: string, second: string) => number;

  beforeAll(async () => {
    const world = await loadWorld();
    const fitWith = (rigs: string[]): Fitting =>
      ({
        name: 'Anomaly Astero',
        shipTypeId: world.id('Astero'),
        modules: Object.entries({ ...ASTERO, rig: rigs }).flatMap(([slot, names]) =>
          names.map((name, i) => fitModule(world.id, slot as FittingSlotKind, i, name))
        ),
        drones: [],
        cargo: [],
      }) as unknown as Fitting;
    const before = await world.stats(fitWith(ASTERO.rig));
    const scores = new Map<string, number>();
    for (const rigs of [
      ['Small Memetic Algorithm Bank I', 'Small Low Friction Nozzle Joints II'],
      ['Small Polycarbon Engine Housing II', 'Small Low Friction Nozzle Joints II'],
    ]) {
      const a = await world.stats(fitWith(rigs));
      scores.set(rigs.join('+'), scoreOf('explore', before, a, null, undefined, 'cargo')!);
    }
    scoreWith = (first, second) => scores.get(`${first}+${second}`)!;
  }, 90_000);

  it('a Memetic Algorithm Bank I outscores a Polycarbon Engine Housing II', () => {
    const low = 'Small Low Friction Nozzle Joints II';
    const [memetic, polycarbon] = [
      scoreWith('Small Memetic Algorithm Bank I', low),
      scoreWith('Small Polycarbon Engine Housing II', low),
    ];
    expect(memetic).toBeGreaterThan(polycarbon);
  });
});

/** A sentry Dominix with no propulsion: the #5548 review's drone boat without its micro jump drive. */
const DOMINIX = {
  low: [
    'Large Armor Repairer II',
    'Multispectrum Energized Membrane II',
    'Reactive Armor Hardener',
    'Damage Control II',
    'Drone Damage Amplifier II',
    'Drone Damage Amplifier II',
    'Drone Damage Amplifier II',
  ],
  medium: [
    'Omnidirectional Tracking Link II',
    'Omnidirectional Tracking Link II',
    'Sensor Booster II',
    'Cap Recharger II',
    'Cap Recharger II',
  ],
  high: [
    'Drone Link Augmentor II',
    'Drone Link Augmentor II',
    'Drone Link Augmentor II',
    'Drone Link Augmentor II',
  ],
  rig: [
    'Large Auxiliary Nano Pump I',
    'Large Auxiliary Nano Pump I',
    'Large Processor Overclocking Unit I',
  ],
};

describe('Improve makeover on a PvE Dominix without propulsion (real WASM + real pinned SDE)', () => {
  let types: TypeMap;
  let plain: MakeoverSearch | null;
  let common: MakeoverSearch | null;
  let optOut: MakeoverSearch | null;
  let pvp: MakeoverSearch | null;

  beforeAll(async () => {
    const world = await loadWorld();
    types = world.types;
    const dominix = {
      name: 'Sentry Dominix',
      shipTypeId: world.id('Dominix'),
      modules: Object.entries(DOMINIX).flatMap(([slot, names]) =>
        names.map((name, i) => fitModule(world.id, slot as FittingSlotKind, i, name))
      ),
      drones: [{ typeId: world.id('Garde II'), quantity: 5, state: 'active' }],
      cargo: [],
    } as unknown as Fitting;
    plain = (await world.search(dominix, { job: 'pve' })).result;
    common = (await world.search(dominix, { job: 'pve' }, 'overall', DOMINIX_PVE)).result;
    optOut = (await world.search(dominix, { job: 'pve', noPropulsion: true })).result;
    pvp = (await world.search(dominix, { job: 'pvp' })).result;
  }, 150_000);

  const propulsionOf = (found: MakeoverSearch | null) =>
    (found?.makeover?.fitting.modules ?? [])
      .filter((m) => PROPULSION_GROUPS.includes(types[String(m.typeId)].groupID))
      .map((m) => types[String(m.typeId)].name);

  it('adds a Large Micro Jump Drive: by the battleship rule, and as the hull fits mostly carry', () => {
    expect(propulsionOf(plain)).toEqual(['Large Micro Jump Drive']);
    expect(propulsionOf(common)).toEqual(['Large Micro Jump Drive']);
  });

  it('adds none with the opt-out, and forces none under PvP (its score may still pick one)', () => {
    expect(propulsionOf(optOut)).toEqual([]);
    expect(pvp?.makeover?.rows.some((row) => row.addsPropulsionFor) ?? false).toBe(false);
  });

  it('never removes the micro jump drive it added, nor turns it into an afterburner', () => {
    const fit = plain?.makeover?.fitting;
    expect(fit?.modules.filter((m) => types[String(m.typeId)].groupID === 46)).toEqual([]);
  });
});
