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
    // rate = 20 + 20/2 = 30 SP/min; L1 = 250 SP -> 500 s
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
    // L1: 250 SP -> 500 s; L2: 1415-250 = 1165 SP -> 2330 s
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
    // int 20+5, mem 10+2 -> rate 25 + 6 = 31 SP/min
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 10), implants: { intelligence: 5, memory: 2 } },
      skills
    );
    expect(step.seconds).toBeCloseTo((250 / 31) * 60, 6);
  });

  it('splits a step when a booster expires mid-step', () => {
    // base rate 20 + 10/2 = 25; boosted +10 int -> 35 SP/min for first 300 s
    // 300 s * 35/60 SP/s = 175 SP; remaining 75 SP at 25/min -> 180 s; total 480 s
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
    // Booster +10 int expires at t=600 s. Rate boosted 35 SP/min, base 25.
    // L1: 250 SP at 35/min -> 3000/7 s (inside booster window).
    // L2: 1165 SP; (600 - 3000/7) s boosted -> 100 SP; 1065 SP at 25/min -> 2556 s.
    // Step 2 total: 3156 - 3000/7 s; cumulative: 3156 s.
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
    expect(step.seconds).toBeCloseTo(600, 6); // rate 25 -> 250 SP -> 600 s
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
    // int 25, mem 12 -> rate 31
    expect(step.seconds).toBeCloseTo((250 / 31) * 60, 6);
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
    // The default has to stay exactly as it was: the optimizer's remap DP
    // costs its branches from (rank, level) alone, so a schedule that
    // silently credited partial SP would make its baseline incomparable.
    const [step] = computeSchedule(L1, { attributes: attrs(20, 20) }, skills);
    expect(step.sp).toBe(250);
    expect(step.seconds).toBe(500);
  });

  it('credits SP already banked in the level being trained', () => {
    // rate 30 SP/min. L1 is 250 SP; 100 already banked leaves 150 SP -> 300 s.
    const [step] = computeSchedule(
      L1,
      { attributes: attrs(20, 20), trainedSkills: trained(0, 100) },
      skills
    );
    expect(step.sp).toBe(150);
    expect(step.seconds).toBe(300);
  });

  it("reports `sp` as the SP the step must still train, not the level's full cost", () => {
    // L2 costs 1165 SP; the skill holds 750, i.e. 500 into level 2 already.
    const [step] = computeSchedule(
      [{ skillTypeID: 100, level: 2 }],
      { attributes: attrs(20, 20), trainedSkills: trained(1, 750) },
      skills
    );
    expect(step.sp).toBe(1415 - 750);
    expect(step.seconds).toBeCloseTo(((1415 - 750) / 30) * 60, 6);
  });

  it('credits the level in progress only, never the levels queued behind it', () => {
    // Banked SP belongs to level 1. Level 2 must still cost its full 1165 SP.
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
    // A stale `/skills` read can report SP past the level the plan still
    // lists. Zero seconds is the honest answer; a negative `remaining` would
    // never satisfy the rate loop's exit condition.
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
    // base rate 25, boosted +10 int -> 35 for the first 300 s. 150 SP left of
    // L1: 300 s * 35/60 = 175 SP would overshoot, so it finishes inside the
    // window at 150 / (35/60) = 1800/7 s.
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
        attributes: attrs(1, 1), // must be ignored: fully overridden from step 0
        segments: [{ startIndex: 0, attributes: attrs(20, 20) }],
      },
      skills
    );
    expect(segmented).toEqual(flat);
  });

  it('a segment starting mid-plan applies its own attributes only from that step onward', () => {
    // Step 0 (L1, 250 SP) trains at 30 SP/min on attrs(20,20) -> 500 s.
    // Steps 1-2 (L2 1165 SP, L3 6585 SP) remap to attrs(27,21) -> 37.5 SP/min.
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
    // rate 45 SP/min for steps 0-1, rate 15 SP/min for step 2.
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
    // Step 1 segment attrs(27,21) + booster +10 int -> rate (37+21/2)=47.5 for
    // the whole step (booster expires well after the plan finishes).
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
    // Omega L1 500 s, L2 2330 s -> Alpha 1000 s, 4660 s.
    expect(alpha[0].seconds).toBe(1000);
    expect(alpha[1].seconds).toBe(4660);
    expect(alpha[1].cumulativeSeconds).toBe(2 * omega[1].cumulativeSeconds);
    // SP owed does not change, only how fast it trains.
    expect(alpha.map((s) => s.sp)).toEqual(omega.map((s) => s.sp));
  });

  it('halves the rate inside a Booster window, so the Booster covers half the SP', () => {
    // Alpha base 25/2 = 12.5 SP/min; boosted 35/2 = 17.5 SP/min for 300 s.
    // 300 s * 17.5/60 = 87.5 SP; 162.5 SP left at 12.5/min -> 780 s; total 1080 s.
    // Doubling the Omega answer (2 * 480 = 960 s) would be wrong.
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
