/**
 * A two-faction Ship Tree for the tab's component tests: Caldari (Corvette,
 * Frigate, Navy Frigate, Interceptor — the last needing Omega) and the
 * Guristas (one Frigate class drawing on Caldari and Gallente skills).
 */
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import type { SkillCatalog } from '@/features/skills/skillMap';
import type { MasteryMap, ShipTreeData, ShipTreeShip } from '@/sde/types';

export const SPACESHIP_COMMAND = 3327;
export const CALDARI_FRIGATE = 3330;
export const GALLENTE_FRIGATE = 3328;
export const INTERCEPTORS = 12092;

export const IBIS = 596;
export const MERLIN = 603;
export const HOOKBILL = 17619;
export const CROW = 11176;
export const WORM = 17930;
export const TENGU = 29984;

const STATS = {
  highSlots: 3,
  medSlots: 4,
  lowSlots: 2,
  rigSlots: 3,
  rigSize: 1,
  turretHardpoints: 3,
  launcherHardpoints: 1,
  cpu: 180,
  powergrid: 45,
  calibration: 400,
  droneBay: 0,
  droneBandwidth: 0,
};

function hull(over: Partial<ShipTreeShip> & Pick<ShipTreeShip, 'typeID' | 'name'>): ShipTreeShip {
  return {
    factionID: 500001,
    treeGroupID: 8,
    techLevel: 1,
    metaLevel: 0,
    required: [{ skillTypeID: CALDARI_FRIGATE, level: 1 }],
    traits: [],
    stats: STATS,
    description: '',
    ...over,
  };
}

export const SHIP_TREE: ShipTreeData = {
  factions: [
    { id: 500001, name: 'Caldari State', description: 'Missiles and shields.' },
    { id: 500004, name: 'Gallente Federation', description: 'Hybrids and drones.' },
    { id: 500010, name: 'Guristas Pirates', description: 'Missiles and drones.' },
  ],
  groups: {
    '4': {
      id: 4,
      name: 'Corvette',
      description: '',
      icon: 'rookie',
      prereqsByFaction: {
        '500001': [{ skillTypeID: SPACESHIP_COMMAND, level: 1, display: false }],
      },
    },
    '8': {
      id: 8,
      name: 'Frigate',
      description: 'Small, fast but fragile.',
      icon: 'frigate',
      prereqsByFaction: {
        '500001': [{ skillTypeID: CALDARI_FRIGATE, level: 1, display: true }],
        '500010': [
          { skillTypeID: CALDARI_FRIGATE, level: 1, display: true },
          { skillTypeID: GALLENTE_FRIGATE, level: 1, display: true },
        ],
      },
    },
    '9': {
      id: 9,
      name: 'Navy Frigate',
      description: '',
      icon: 'frigate',
      prereqsByFaction: { '500001': [{ skillTypeID: CALDARI_FRIGATE, level: 1, display: true }] },
    },
    '10': {
      id: 10,
      name: 'Interceptor',
      description: '',
      icon: 'frigate',
      prereqsByFaction: {
        '500001': [
          { skillTypeID: CALDARI_FRIGATE, level: 4, display: true },
          { skillTypeID: INTERCEPTORS, level: 1, display: true },
        ],
      },
    },
    '22': {
      id: 22,
      name: 'Strategic Cruiser',
      description: '',
      icon: 'cruiser',
      prereqsByFaction: { '500001': [{ skillTypeID: CALDARI_FRIGATE, level: 1, display: true }] },
    },
  },
  ships: [
    hull({ typeID: IBIS, name: 'Ibis', treeGroupID: 4, required: [] }),
    hull({
      typeID: MERLIN,
      name: 'Merlin',
      traits: [
        { skillTypeID: CALDARI_FRIGATE, bonus: 5, unit: '%', text: 'bonus to shield resistances' },
        { skillTypeID: null, bonus: null, unit: '', text: 'Can fit a warp disruptor' },
      ],
      description: 'The Merlin is the most powerful combat frigate of the Caldari.',
    }),
    hull({ typeID: HOOKBILL, name: 'Caldari Navy Hookbill', treeGroupID: 9 }),
    hull({
      typeID: CROW,
      name: 'Crow',
      treeGroupID: 10,
      techLevel: 2,
      required: [
        { skillTypeID: CALDARI_FRIGATE, level: 4 },
        { skillTypeID: INTERCEPTORS, level: 1 },
      ],
    }),
    hull({
      typeID: TENGU,
      name: 'Tengu',
      treeGroupID: 22,
      techLevel: 3,
      stats: { ...STATS, highSlots: 0, medSlots: 0, lowSlots: 0, turretHardpoints: 0 },
    }),
    hull({ typeID: WORM, name: 'Worm', factionID: 500010, metaLevel: 6 }),
  ],
};

/** Merlin: every tier trained by the fixture pilot (Mastery V). Crow: tier I only. */
export const MASTERIES: MasteryMap = {
  [MERLIN]: [
    [{ skillTypeID: CALDARI_FRIGATE, level: 1 }],
    [{ skillTypeID: CALDARI_FRIGATE, level: 2 }],
    [{ skillTypeID: CALDARI_FRIGATE, level: 3 }],
    [{ skillTypeID: CALDARI_FRIGATE, level: 4 }],
    [{ skillTypeID: SPACESHIP_COMMAND, level: 5 }],
  ],
  [CROW]: [
    // Level 0: CCP lists the skill under the tier but asks for nothing yet.
    [
      { skillTypeID: INTERCEPTORS, level: 1 },
      { skillTypeID: GALLENTE_FRIGATE, level: 0 },
    ],
    [{ skillTypeID: INTERCEPTORS, level: 3 }],
    [],
    [],
    [],
  ],
};

function skill(typeID: number, name: string, alphaMaxLevel: number): EngineSkill {
  return {
    typeID,
    name,
    rank: 1,
    primary: 'perception',
    secondary: 'willpower',
    prereqs: [],
    alphaMaxLevel,
  };
}

const SKILLS = [
  skill(SPACESHIP_COMMAND, 'Spaceship Command', 4),
  skill(CALDARI_FRIGATE, 'Caldari Frigate', 4),
  skill(GALLENTE_FRIGATE, 'Gallente Frigate', 4),
  skill(INTERCEPTORS, 'Interceptors', 0),
];

export const CATALOG = {
  engineSkills: new Map(SKILLS.map((s) => [s.typeID, s])),
  bySkillTypeID: new Map(SKILLS.map((s) => [s.typeID, { typeID: s.typeID, name: s.name }])),
  unlocksByTypeID: new Map(),
} as unknown as SkillCatalog;

/** Spaceship Command V and Caldari Frigate IV: every Caldari T1 hull, no Interceptor. */
export const TRAINED: ReadonlyMap<number, TrainedSkill> = new Map([
  [SPACESHIP_COMMAND, { level: 5, sp: 256_000 }],
  [CALDARI_FRIGATE, { level: 4, sp: 45_255 }],
]);
