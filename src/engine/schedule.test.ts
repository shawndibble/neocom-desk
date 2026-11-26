import { describe, it, expect } from 'vitest';
import { computeSchedule } from '@/engine/schedule';
import type { Attributes, EngineSkill, PlanStep, TrainedSkill } from '@/engine/types';

const GUNNERY: EngineSkill = {
  typeID: 100,
  name: 'Gunnery',
  rank: 1,
  primary: 'intelligence',
  secondary: 'memory',
  prereqs: [],
};
const skills = new Map([[100, GUNNERY]]);

function attrs(intelligence: number, memory: number): Attributes {
  return { intelligence, memory, perception: 17, willpower: 17, charisma: 17 };
}

const L1: PlanStep[] = [{ skillTypeID: 100, level: 1 }];

describe('computeSchedule', () => {
  it('returns empty for empty steps', () => {
    expect(computeSchedule([], { attributes: attrs(20, 20) }, skills)).toEqual([]);
  });

  it('computes sp and seconds at a flat rate', () => {
    const [step] = computeSchedule(L1, { attributes: attrs(20, 20) }, skills);
    expect(step).toEqual({
      skillTypeID: 100,
      level: 1,
      sp: 250,
      seconds: 500,
      cumulativeSeconds: 500,
    });
  });

  it('accumulates cumulativeSeconds across steps', () => {
    const steps: PlanStep[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
    ];
    const result = computeSchedule(steps, { attributes: attrs(20, 20) }, skills);
    expect(result[0].cumulativeSeconds).toBe(500);
    expect(result[1].sp).toBe(1165);
    expect(result[1].seconds).toBe(2330);
    expect(result[1].cumulativeSeconds).toBe(2830);
  });

  it('adds implant bonuses to attributes', () => {
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 10), implants: { intelligence: 5, memory: 2 } },
      skills
    );
    expect(step.seconds).toBeCloseTo((250 / 31) * 60, 6);
  });

  it('splits a step when a booster expires mid-step', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(300_000) }],
        startDate: new Date(0),
      },
      skills
    );
    expect(step.sp).toBe(250);
    expect(step.seconds).toBeCloseTo(480, 6);
    expect(step.cumulativeSeconds).toBeCloseTo(480, 6);
  });

  it('applies booster expiry across step boundaries', () => {
    const steps: PlanStep[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
    ];
    const result = computeSchedule(
      steps,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(600_000) }],
        startDate: new Date(0),
      },
      skills
    );
    expect(result[0].seconds).toBeCloseTo(3000 / 7, 6);
    expect(result[1].seconds).toBeCloseTo(3156 - 3000 / 7, 6);
    expect(result[1].cumulativeSeconds).toBeCloseTo(3156, 6);
  });

  it('ignores boosters already expired at start', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(0) }],
        startDate: new Date(60_000),
      },
      skills
    );
    expect(step.seconds).toBeCloseTo(600, 6);
  });

  it('stacks multiple active boosters', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [
          { bonus: { intelligence: 3 }, expiresAt: new Date(10_000_000) },
          { bonus: { intelligence: 2, memory: 2 }, expiresAt: new Date(10_000_000) },
        ],
        startDate: new Date(0),
      },
      skills
    );
    expect(step.seconds).toBeCloseTo((250 / 31) * 60, 6);
  });

  it('a Booster with startsAt speeds only steps that train after it begins', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [
          {
            bonus: { intelligence: 10 },
            startsAt: new Date(300_000),
            expiresAt: new Date(10_000_000),
          },
        ],
        startDate: new Date(0),
      },
      skills
    );
    expect(step.sp).toBe(250);
    expect(step.seconds).toBeCloseTo(300 + (125 / 35) * 60, 6);
  });

  it('splits a step at both a Booster start and its expiry', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [
          {
            bonus: { intelligence: 10 },
            startsAt: new Date(200_000),
            expiresAt: new Date(400_000),
          },
        ],
        startDate: new Date(0),
      },
      skills
    );
    expect(step.seconds).toBeCloseTo(520, 6);
  });

  it('combines two back-to-back Boosters into the same coverage as one continuous Booster', () => {
    const steps: PlanStep[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
    ];
    const continuous = computeSchedule(
      steps,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(600_000) }],
        startDate: new Date(0),
      },
      skills
    );
    const backToBack = computeSchedule(
      steps,
      {
        attributes: attrs(20, 10),
        boosters: [
          { bonus: { intelligence: 10 }, expiresAt: new Date(300_000) },
          {
            bonus: { intelligence: 10 },
            startsAt: new Date(300_000),
            expiresAt: new Date(600_000),
          },
        ],
        startDate: new Date(0),
      },
      skills
    );
    expect(backToBack).toEqual(continuous);
  });

  it('never applies a Booster whose startsAt is at or after its own expiry', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [
          {
            bonus: { intelligence: 10 },
            startsAt: new Date(400_000),
            expiresAt: new Date(200_000),
          },
        ],
        startDate: new Date(0),
      },
      skills
    );
    expect(step.seconds).toBeCloseTo(600, 6);
  });

  it('requires startDate when boosters are provided', () => {
    expect(() =>
      computeSchedule(
        L1,
        { attributes: attrs(20, 10), boosters: [{ bonus: {}, expiresAt: new Date(1) }] },
        skills
      )
    ).toThrow(/startDate/);
  });

  it('throws on unknown skill in a step', () => {
    expect(() =>
      computeSchedule([{ skillTypeID: 999, level: 1 }], { attributes: attrs(20, 20) }, skills)
    ).toThrow(/999/);
  });
});

describe('computeSchedule partial-SP credit', () => {
  const trained = (level: number, sp: number): ReadonlyMap<number, TrainedSkill> =>
    new Map<number, TrainedSkill>([[100, { level, sp }]]);

  it('charges the full level when no trainedSkills map is given', () => {
    const [step] = computeSchedule(L1, { attributes: attrs(20, 20) }, skills);
    expect(step.sp).toBe(250);
    expect(step.seconds).toBe(500);
  });

  it('credits SP already banked in the level being trained', () => {
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 20), trainedSkills: trained(0, 100) },
      skills
    );
    expect(step.sp).toBe(150);
    expect(step.seconds).toBe(300);
  });

  it("reports `sp` as the SP the step must still train, not the level's full cost", () => {
    const [step] = computeSchedule(
      [{ skillTypeID: 100, level: 2 }],
      { attributes: attrs(20, 20), trainedSkills: trained(1, 750) },
      skills
    );
    expect(step.sp).toBe(1415 - 750);
    expect(step.seconds).toBeCloseTo(((1415 - 750) / 30) * 60, 6);
  });

  it('credits the level in progress only, never the levels queued behind it', () => {
    const result = computeSchedule(
      [
        { skillTypeID: 100, level: 1 },
        { skillTypeID: 100, level: 2 },
      ],
      { attributes: attrs(20, 20), trainedSkills: trained(0, 100) },
      skills
    );
    expect(result[0].sp).toBe(150);
    expect(result[1].sp).toBe(1165);
    expect(result[1].cumulativeSeconds).toBeCloseTo(300 + 2330, 6);
  });

  it('leaves a skill absent from the map costed as a full level', () => {
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 20), trainedSkills: new Map() },
      skills
    );
    expect(step.sp).toBe(250);
  });

  it('costs a fully-paid level at zero rather than looping or going negative', () => {
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 20), trainedSkills: trained(1, 5000) },
      skills
    );
    expect(step.sp).toBe(0);
    expect(step.seconds).toBe(0);
    expect(step.cumulativeSeconds).toBe(0);
  });

  it('applies the credit before boosters, so a shortened step still splits correctly', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        trainedSkills: trained(0, 100),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(300_000) }],
        startDate: new Date(0),
      },
      skills
    );
    expect(step.sp).toBe(150);
    expect(step.seconds).toBeCloseTo(1800 / 7, 6);
  });
});

describe('computeSchedule with attribute segments (Remap Markers)', () => {
  const steps: PlanStep[] = [
    { skillTypeID: 100, level: 1 },
    { skillTypeID: 100, level: 2 },
    { skillTypeID: 100, level: 3 },
  ];

  it('ignores `segments` entirely when omitted, unchanged from the flat-attributes behaviour', () => {
    const flat = computeSchedule(steps, { attributes: attrs(20, 20) }, skills);
    const withEmptySegments = computeSchedule(
      steps,
      { attributes: attrs(20, 20), segments: [] },
      skills
    );
    expect(withEmptySegments).toEqual(flat);
  });

  it('a single segment starting at index 0 behaves exactly like the flat attributes it replaces', () => {
    const flat = computeSchedule(steps, { attributes: attrs(20, 20) }, skills);
    const segmented = computeSchedule(
      steps,
      {
        attributes: attrs(1, 1),
        segments: [{ startIndex: 0, attributes: attrs(20, 20) }],
      },
      skills
    );
    expect(segmented).toEqual(flat);
  });

  it('a segment starting mid-plan applies its own attributes only from that step onward', () => {
    const result = computeSchedule(
      steps,
      {
        attributes: attrs(20, 20),
        segments: [{ startIndex: 1, attributes: attrs(27, 21) }],
      },
      skills
    );
    expect(result[0].seconds).toBeCloseTo(500, 6);
    expect(result[1].seconds).toBeCloseTo((1165 / 37.5) * 60, 6);
    expect(result[2].seconds).toBeCloseTo((6585 / 37.5) * 60, 6);
  });

  it('two segments each apply to their own step range', () => {
    const result = computeSchedule(
      steps,
      {
        attributes: attrs(20, 20),
        segments: [
          { startIndex: 0, attributes: attrs(30, 30) },
          { startIndex: 2, attributes: attrs(10, 10) },
        ],
      },
      skills
    );
    expect(result[0].seconds).toBeCloseTo((250 / 45) * 60, 6);
    expect(result[1].seconds).toBeCloseTo((1165 / 45) * 60, 6);
    expect(result[2].seconds).toBeCloseTo((6585 / 15) * 60, 6);
  });

  it('sorts unordered segments before applying them', () => {
    const sorted = computeSchedule(
      steps,
      {
        attributes: attrs(20, 20),
        segments: [
          { startIndex: 2, attributes: attrs(10, 10) },
          { startIndex: 0, attributes: attrs(30, 30) },
        ],
      },
      skills
    );
    const reference = computeSchedule(
      steps,
      {
        attributes: attrs(20, 20),
        segments: [
          { startIndex: 0, attributes: attrs(30, 30) },
          { startIndex: 2, attributes: attrs(10, 10) },
        ],
      },
      skills
    );
    expect(sorted).toEqual(reference);
  });

  it('combines with a live Booster on top of the segment attributes', () => {
    const result = computeSchedule(
      steps,
      {
        attributes: attrs(20, 20),
        segments: [{ startIndex: 1, attributes: attrs(27, 21) }],
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(10_000_000) }],
        startDate: new Date(0),
      },
      skills
    );
    expect(result[1].seconds).toBeCloseTo((1165 / 47.5) * 60, 6);
  });
});

describe('computeSchedule clone state', () => {
  it('doubles every step for an Alpha clone when nothing is time-bound', () => {
    const steps: PlanStep[] = [
      { skillTypeID: 100, level: 1 },
      { skillTypeID: 100, level: 2 },
    ];
    const omega = computeSchedule(steps, { attributes: attrs(20, 20) }, skills);
    const alpha = computeSchedule(
      steps,
      { attributes: attrs(20, 20), cloneState: 'alpha' },
      skills
    );
    expect(alpha[0].seconds).toBe(1000);
    expect(alpha[1].seconds).toBe(4660);
    expect(alpha[1].cumulativeSeconds).toBe(2 * omega[1].cumulativeSeconds);
    expect(alpha.map((s) => s.sp)).toEqual(omega.map((s) => s.sp));
  });

  it('halves the rate inside a Booster window, so the Booster covers half the SP', () => {
    const [step] = computeSchedule(
      L1,
      {
        attributes: attrs(20, 10),
        boosters: [{ bonus: { intelligence: 10 }, expiresAt: new Date(300_000) }],
        startDate: new Date(0),
        cloneState: 'alpha',
      },
      skills
    );
    expect(step.seconds).toBeCloseTo(1080, 6);
  });
});
