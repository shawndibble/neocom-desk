import { describe, expect, it } from 'vitest';
import type { MasteryMap, ShipTreeShip } from '@/sde/types';
import type { Attributes, EngineSkill, TrainedSkill } from '@/engine/types';
import { hullStatuses } from './status';

// A and B: intelligence/memory, rank 1. At 20 in every attribute that is
// 20 + 20/2 = 30 SP/min, so a level I (250 SP) takes 500s.
const skill = (typeID: number): EngineSkill => ({
  typeID,
  name: `S${typeID}`,
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [],
  alphaMaxLevel: 5,
});
const A = 10;
const B = 20;
const C = 30;
const SKILLS = new Map([A, B, C].map((id) => [id, skill(id)]));
const ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 20,
};

function ship(typeID: number, required: ShipTreeShip['required']): ShipTreeShip {
  return {
    typeID,
    name: `Hull ${typeID}`,
    factionID: 500001,
    treeGroupID: 8,
    techLevel: 1,
    metaLevel: 0,
    required,
    traits: [],
    stats: {
      highSlots: 0,
      medSlots: 0,
      lowSlots: 0,
      rigSlots: 0,
      rigSize: 0,
      turretHardpoints: 0,
      launcherHardpoints: 0,
      cpu: 0,
      powergrid: 0,
      calibration: 0,
      droneBay: 0,
      droneBandwidth: 0,
    },
    description: '',
  };
}

const trained = (levels: Record<number, number>): Map<number, TrainedSkill> =>
  new Map(Object.entries(levels).map(([id, level]) => [Number(id), { level, sp: 0 }]));

function statuses(
  ships: ShipTreeShip[],
  masteries: MasteryMap,
  levels: Record<number, number>
): ReturnType<typeof hullStatuses> {
  return hullStatuses(ships, masteries, {
    skills: SKILLS,
    trainedSkills: trained(levels),
    attributes: ATTRIBUTES,
    implants: {},
    cloneState: 'omega',
    now: new Date('2026-01-01T00:00:00Z'),
  });
}

const tier = (...ids: number[]) => ids.map((skillTypeID) => ({ skillTypeID, level: 1 }));

describe('hullStatuses', () => {
  it('can fly a hull with every required skill trained, 0s to fly', () => {
    const s = statuses([ship(1, [{ skillTypeID: A, level: 1 }])], {}, { [A]: 1 });
    expect(s.get(1)).toMatchObject({ canFly: true, secondsToFly: 0 });
  });

  it('times only the missing required skills', () => {
    const s = statuses(
      [
        ship(1, [
          { skillTypeID: A, level: 1 },
          { skillTypeID: B, level: 1 },
        ]),
      ],
      {},
      { [A]: 1 }
    );
    expect(s.get(1)).toEqual({ canFly: false, secondsToFly: 500, mastery: 0 });
  });

  it('counts the highest Mastery tier fully trained, in order', () => {
    const masteries: MasteryMap = {
      '1': [tier(A), tier(A), tier(B), tier(C), tier(C)],
    };
    const s = statuses([ship(1, [{ skillTypeID: A, level: 1 }])], masteries, { [A]: 1, [C]: 1 });
    // Tier III (B) is unmet, so IV and V don't count even though C is trained.
    expect(s.get(1)?.mastery).toBe(2);
  });

  it('is Mastery V when every tier is met', () => {
    const masteries: MasteryMap = { '1': [tier(A), tier(A), tier(A), tier(A), tier(B)] };
    const s = statuses([ship(1, [{ skillTypeID: A, level: 1 }])], masteries, { [A]: 1, [B]: 1 });
    expect(s.get(1)?.mastery).toBe(5);
  });

  it('tops out at IV when tier V is empty — never gold', () => {
    const masteries: MasteryMap = { '1': [tier(A), tier(A), tier(A), tier(A), []] };
    const s = statuses([ship(1, [{ skillTypeID: A, level: 1 }])], masteries, { [A]: 1 });
    expect(s.get(1)?.mastery).toBe(4);
  });

  it('is Mastery 0 when the hull cannot be flown, even with tiers met', () => {
    const masteries: MasteryMap = { '1': [tier(A), tier(A), tier(A), tier(A), tier(A)] };
    const s = statuses([ship(1, [{ skillTypeID: B, level: 1 }])], masteries, { [A]: 1 });
    expect(s.get(1)?.mastery).toBe(0);
  });

  it('is Mastery 0 for a hull with no mastery data', () => {
    const s = statuses([ship(1, [{ skillTypeID: A, level: 1 }])], {}, { [A]: 1 });
    expect(s.get(1)?.mastery).toBe(0);
  });

  it('has a status for every hull', () => {
    const s = statuses([ship(1, []), ship(2, [{ skillTypeID: A, level: 2 }])], {}, {});
    expect([...s.keys()]).toEqual([1, 2]);
    expect(s.get(1)?.canFly).toBe(true);
    expect(s.get(2)?.secondsToFly).toBeGreaterThan(500);
  });
});
