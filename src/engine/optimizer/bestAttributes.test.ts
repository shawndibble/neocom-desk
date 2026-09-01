import { describe, it, expect } from 'vitest';
import {
  allocationCostTable,
  bestAttributes,
  bestAttributesForPairs,
  ATTRIBUTE_NAMES,
} from '@/engine/optimizer/bestAttributes';
import { timeToTrain, trainingRate } from '@/engine/sp';
import type { AttributeName, Attributes, EngineSkill, PlanStep } from '@/engine/types';

const skill = (
  typeID: number,
  primary: AttributeName,
  secondary: AttributeName,
  rank = 1
): EngineSkill => ({ typeID, name: `Skill ${typeID}`, rank, primary, secondary, prereqs: [] });

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const ATTRS: AttributeName[] = ['intelligence', 'memory', 'perception', 'willpower', 'charisma'];

const sum = (attrs: Record<AttributeName, number>): number =>
  ATTRS.reduce((acc, a) => acc + attrs[a], 0);

describe('bestAttributes', () => {
  it('returns zero seconds and default spread for an empty segment', () => {
    const { attributes, seconds } = bestAttributes([], skillMap());
    expect(seconds).toBe(0);
    expect(sum(attributes)).toBe(99);
    expect(attributes.charisma).toBe(19);
  });

  it('maxes primary then secondary for a single attribute pair', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const steps: PlanStep[] = [{ skillTypeID: 1, level: 1 }]; // 250 SP
    const { attributes, seconds } = bestAttributes(steps, skills);
    expect(attributes.perception).toBe(27);
    expect(attributes.willpower).toBe(21);
    expect(attributes.intelligence).toBe(17);
    expect(attributes.memory).toBe(17);
    expect(attributes.charisma).toBe(17);
    // 250 SP at 27 + 21/2 = 37.5 SP/min -> 400 s
    expect(seconds).toBeCloseTo(400, 9);
  });

  it('accounts for implants in the training rate', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const steps: PlanStep[] = [{ skillTypeID: 1, level: 1 }];
    const { seconds } = bestAttributes(steps, skills, { perception: 5 });
    // 250 SP at (27+5) + 21/2 = 42.5 SP/min
    expect(seconds).toBeCloseTo((250 / 42.5) * 60, 9);
  });

  it('never allocates below 17 or above 27 and always totals 99', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory'),
      skill(3, 'charisma', 'willpower', 3)
    );
    const steps: PlanStep[] = [
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 2, level: 1 },
      { skillTypeID: 2, level: 2 },
      { skillTypeID: 3, level: 1 },
    ];
    const { attributes } = bestAttributes(steps, skills, { intelligence: 4, charisma: 5 });
    for (const a of ATTRS) {
      expect(attributes[a]).toBeGreaterThanOrEqual(17);
      expect(attributes[a]).toBeLessThanOrEqual(27);
    }
    expect(sum(attributes)).toBe(99);
  });

  it('matches a brute-force search over all valid allocations', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory', 2)
    );
    const steps: PlanStep[] = [
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 1, level: 2 },
      { skillTypeID: 2, level: 1 },
    ];
    const implants = { memory: 3 };
    const { seconds } = bestAttributes(steps, skills, implants);

    // Independent brute force: sp per pair is 1415 (perc/will, rank 1 to L2) + 500 (int/mem rank 2 L1).
    let best = Infinity;
    for (let i = 0; i <= 10; i++)
      for (let m = 0; m <= 10; m++)
        for (let p = 0; p <= 10; p++)
          for (let w = 0; w <= 10; w++) {
            const c = 14 - i - m - p - w;
            if (c < 0 || c > 10) continue;
            const t =
              (1415 / (17 + p + (17 + w) / 2)) * 60 + (500 / (17 + i + (17 + m + 3) / 2)) * 60;
            if (t < best) best = t;
          }
    expect(seconds).toBeCloseTo(best, 6);
  });

  it('shifts the optimum when implants change relative marginal value', () => {
    // Two pairs with equal SP; heavy implants on int/mem lower the marginal
    // value of allocating there, pushing points toward perception/willpower.
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory')
    );
    const steps: PlanStep[] = [
      { skillTypeID: 1, level: 3 },
      { skillTypeID: 2, level: 3 },
    ].flatMap((s) =>
      Array.from({ length: s.level }, (_, i) => ({ skillTypeID: s.skillTypeID, level: i + 1 }))
    );
    const plain = bestAttributes(steps, skills);
    const boosted = bestAttributes(steps, skills, { intelligence: 5, memory: 5 });
    expect(boosted.attributes.perception + boosted.attributes.willpower).toBeGreaterThan(
      plain.attributes.perception + plain.attributes.willpower
    );
  });
});

describe('bestAttributes with Boosters', () => {
  const START = new Date('2026-08-30T00:00:00Z');
  const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);

  // Two pairs so the optimizer has a real trade-off to get wrong.
  const skills = skillMap(
    skill(1, 'perception', 'willpower', 5),
    skill(2, 'intelligence', 'memory', 5)
  );
  const steps: PlanStep[] = [
    { skillTypeID: 1, level: 4 },
    { skillTypeID: 2, level: 4 },
  ];

  it('is unchanged when no Booster context is supplied', () => {
    const plain = bestAttributes(steps, skills);
    const withEmpty = bestAttributes(steps, skills, {}, { boosters: [], startDate: START });
    expect(withEmpty.seconds).toBeCloseTo(plain.seconds, 6);
    expect(withEmpty.attributes).toEqual(plain.attributes);
  });

  it('ignores a Booster that already expired before the segment starts', () => {
    const plain = bestAttributes(steps, skills);
    const expired = bestAttributes(
      steps,
      skills,
      {},
      { boosters: [{ bonus: { intelligence: 12 }, expiresAt: after(-1) }], startDate: START }
    );
    expect(expired.seconds).toBeCloseTo(plain.seconds, 6);
  });

  it('treats a Booster outlasting the whole segment exactly like a permanent implant', () => {
    // The uniform case: every step trains at the boosted rate, so the answer
    // must match folding the bonus into implants. This is also the branch
    // that must NOT fall into the slow walk.
    const bonus = { intelligence: 8, memory: 8, perception: 8, willpower: 8, charisma: 8 };
    const asImplants = bestAttributes(steps, skills, bonus);
    const asBooster = bestAttributes(
      steps,
      skills,
      {},
      { boosters: [{ bonus, expiresAt: after(10 * 365 * 24 * 3600) }], startDate: START }
    );
    expect(asBooster.seconds).toBeCloseTo(asImplants.seconds, 6);
    expect(asBooster.attributes).toEqual(asImplants.attributes);
  });

  it('lands strictly between the unboosted and fully-boosted totals when it expires mid-segment', () => {
    const bonus = { intelligence: 10, memory: 10, perception: 10, willpower: 10, charisma: 10 };
    const unboosted = bestAttributes(steps, skills).seconds;
    const fully = bestAttributes(steps, skills, bonus).seconds;
    const partial = bestAttributes(
      steps,
      skills,
      {},
      { boosters: [{ bonus, expiresAt: after(unboosted / 2) }], startDate: START }
    ).seconds;
    expect(partial).toBeLessThan(unboosted);
    expect(partial).toBeGreaterThan(fully);
  });

  it('agrees with computeSchedule for the allocation it picks', async () => {
    // The load-bearing test: the optimizer's own seconds must equal what the
    // shipped scheduler produces for the same attributes, implants and
    // Booster. If the two ever diverge, the planner shows one number and the
    // optimizer optimizes another — which is the D6 defect in a new place.
    const { computeSchedule } = await import('@/engine/schedule');
    const bonus = { intelligence: 12, perception: 12 };
    const boosters = [{ bonus, expiresAt: after(4000) }];
    const result = bestAttributes(steps, skills, { memory: 3 }, { boosters, startDate: START });

    const scheduled = computeSchedule(
      steps,
      { attributes: result.attributes, implants: { memory: 3 }, boosters, startDate: START },
      skills
    );
    const total = scheduled[scheduled.length - 1].cumulativeSeconds;
    expect(result.seconds).toBeCloseTo(total, 6);
  });

  it('agrees with computeSchedule when two Boosters expire at different times', async () => {
    // Same load-bearing check as above, but for the piecewise case: two
    // Boosters with different expiries. `computeSchedule` already tracks each
    // Booster's own liveness independently (`attributeAt` in schedule.ts), so
    // this is the cross-check that the optimizer's new piecewise walk landed
    // on the same semantics rather than a second, disagreeing model of it.
    const { computeSchedule } = await import('@/engine/schedule');
    const boosters = [
      { bonus: { intelligence: 12 }, expiresAt: after(2000) },
      { bonus: { perception: 12 }, expiresAt: after(6000) },
    ];
    const result = bestAttributes(steps, skills, { memory: 3 }, { boosters, startDate: START });

    const scheduled = computeSchedule(
      steps,
      { attributes: result.attributes, implants: { memory: 3 }, boosters, startDate: START },
      skills
    );
    const total = scheduled[scheduled.length - 1].cumulativeSeconds;
    expect(result.seconds).toBeCloseTo(total, 6);
  });

  it('can choose a different allocation than it would without the Booster', () => {
    // A Booster large enough on one pair should pull the optimum away from
    // the unboosted choice; if it never does, the parameter is decorative.
    const lopsided: PlanStep[] = [
      { skillTypeID: 1, level: 3 },
      { skillTypeID: 2, level: 5 },
    ];
    const plain = bestAttributes(lopsided, skills);
    const boosted = bestAttributes(
      lopsided,
      skills,
      {},
      {
        boosters: [{ bonus: { intelligence: 12, memory: 12 }, expiresAt: after(1e9) }],
        startDate: START,
      }
    );
    expect(boosted.seconds).toBeLessThan(plain.seconds);
  });

  it('pins exact single-Booster seconds and attributes (regression against the piecewise walk)', () => {
    // Locked to pre-piecewise-refactor output at double precision: the single
    // Booster path must stay bit-identical once the walk generalizes to carry
    // more than one Booster's worth of breakpoints.
    const midExpiry = bestAttributes(
      steps,
      skills,
      {},
      {
        boosters: [
          {
            bonus: { intelligence: 10, memory: 10, perception: 10, willpower: 10, charisma: 10 },
            expiresAt: after(6000),
          },
        ],
        startDate: START,
      }
    );
    expect(midExpiry.seconds.toPrecision(17)).toBe('685015.38461538462');
    expect(midExpiry.attributes).toEqual({
      intelligence: 24,
      memory: 17,
      perception: 24,
      willpower: 17,
      charisma: 17,
    });

    const withImplants = bestAttributes(
      steps,
      skills,
      { memory: 3 },
      {
        boosters: [{ bonus: { intelligence: 12, perception: 12 }, expiresAt: after(4000) }],
        startDate: START,
      }
    );
    expect(withImplants.seconds.toPrecision(17)).toBe('670875.84803256439');
    expect(withImplants.attributes).toEqual({
      intelligence: 23,
      memory: 17,
      perception: 25,
      willpower: 17,
      charisma: 17,
    });

    const lateStart = bestAttributes(
      steps,
      skills,
      {},
      {
        boosters: [
          {
            bonus: { intelligence: 10, memory: 10, perception: 10, willpower: 10, charisma: 10 },
            expiresAt: after(6000),
          },
        ],
        startDate: after(5000),
      }
    );
    expect(lateStart.seconds.toPrecision(17)).toBe('687323.07692307699');
    expect(lateStart.attributes).toEqual({
      intelligence: 24,
      memory: 17,
      perception: 24,
      willpower: 17,
      charisma: 17,
    });
  });

  it('credits two Boosters with different expiries each for their own lifetime', () => {
    // The bug: stacking both bonuses until the EARLIEST expiry, then dropping
    // to zero, undercredits the longer-lived Booster for the time between the
    // two expiries. The fix must land in that gap: better than crediting
    // neither bonus there, and no better than crediting both (which would
    // mean the short Booster's own expiry was ignored).
    //
    // A single intelligence/memory pair, sized so unboosted training runs well
    // past both expiries — long enough for all three regimes (both boosted,
    // long-only, neither) to actually be walked in every scenario below.
    const pairSkills = skillMap(skill(1, 'intelligence', 'memory', 5));
    const pairSteps: PlanStep[] = [{ skillTypeID: 1, level: 4 }];
    const shortBonus = { intelligence: 6 };
    const longBonus = { memory: 6 };
    const shortExpiry = after(2000);
    const longExpiry = after(8000);

    const piecewise = bestAttributes(
      pairSteps,
      pairSkills,
      {},
      {
        boosters: [
          { bonus: shortBonus, expiresAt: shortExpiry },
          { bonus: longBonus, expiresAt: longExpiry },
        ],
        startDate: START,
      }
    );
    // Undercrediting comparator: exactly what today's earliest-cutoff bug
    // computes — both bonuses stacked until the short one lapses, then zero.
    const undercredited = bestAttributes(
      pairSteps,
      pairSkills,
      {},
      {
        boosters: [
          { bonus: shortBonus, expiresAt: shortExpiry },
          { bonus: longBonus, expiresAt: shortExpiry },
        ],
        startDate: START,
      }
    );
    // Overcrediting comparator: as if the long bonus alone ran the full
    // long-Booster window with no early loss of the short one's contribution.
    const fullyBoth = bestAttributes(
      pairSteps,
      pairSkills,
      {},
      {
        boosters: [
          { bonus: shortBonus, expiresAt: longExpiry },
          { bonus: longBonus, expiresAt: longExpiry },
        ],
        startDate: START,
      }
    );
    expect(piecewise.seconds).toBeLessThan(undercredited.seconds);
    expect(piecewise.seconds).toBeGreaterThan(fullyBoth.seconds);
  });

  it('honours a segment that starts partway through the Booster window', () => {
    // placeRemaps evaluates later segments that begin after earlier ones have
    // trained, so a segment's remaining Booster life is shorter than the
    // Booster's total life. Same Booster, later start = less benefit.
    const bonus = { intelligence: 10, memory: 10, perception: 10, willpower: 10, charisma: 10 };
    const expiresAt = after(6000);
    const early = bestAttributes(
      steps,
      skills,
      {},
      { boosters: [{ bonus, expiresAt }], startDate: START }
    );
    const late = bestAttributes(
      steps,
      skills,
      {},
      { boosters: [{ bonus, expiresAt }], startDate: after(5000) }
    );
    expect(late.seconds).toBeGreaterThan(early.seconds);
  });
});

describe('allocationCostTable', () => {
  const IM: Attributes = ATTRIBUTE_NAMES.reduce(
    (acc, name) => ({ ...acc, [name]: 0 }),
    {} as Attributes
  );

  it('covers every legal remap spread', () => {
    // 14 free points over 5 attributes, none above 10: C(18,4) - 5*C(7,4).
    expect(allocationCostTable(['intelligence|memory']).count).toBe(2885);
  });

  it('offers only spreads EVE allows: 99 points, each 17..27', () => {
    const table = allocationCostTable(['intelligence|memory']);
    for (let a = 0; a < table.count; a++) {
      const attrs = table.attributesAt(a);
      const values = ATTRIBUTE_NAMES.map((name) => attrs[name]);
      expect(values.reduce((x, y) => x + y, 0)).toBe(99);
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(17);
        expect(value).toBeLessThanOrEqual(27);
      }
    }
  });

  it('prices one SP exactly as sp.ts does, implants included', () => {
    const implants = { ...IM, perception: 5, willpower: 3 };
    const table = allocationCostTable(['perception|willpower'], implants);
    for (const a of [0, 100, 2884]) {
      const attrs = table.attributesAt(a);
      const rate = trainingRate(attrs.perception + 5, attrs.willpower + 3);
      expect(table.secondsPerSp[a * table.width]).toBeCloseTo(timeToTrain(1, rate), 12);
    }
  });

  it('agrees with bestAttributesForPairs on the winning spread', () => {
    // The table is only useful if summing sp x secondsPerSp reproduces the
    // brute force. Same optimum, same attributes, to float tolerance.
    const spByPair = new Map([
      ['intelligence|memory', 500_000],
      ['perception|willpower', 120_000],
      ['charisma|willpower', 8_000],
    ]);
    const keys = [...spByPair.keys()];
    const implants = { ...IM, intelligence: 4 };
    const table = allocationCostTable(keys, implants);

    let bestSeconds = Infinity;
    let bestIndex = -1;
    for (let a = 0; a < table.count; a++) {
      let seconds = 0;
      keys.forEach((key, p) => {
        seconds += spByPair.get(key)! * table.secondsPerSp[a * table.width + p];
      });
      if (seconds < bestSeconds) {
        bestSeconds = seconds;
        bestIndex = a;
      }
    }

    const brute = bestAttributesForPairs(spByPair, implants);
    expect(bestSeconds).toBeCloseTo(brute.seconds, 3);
    expect(table.attributesAt(bestIndex)).toEqual(brute.attributes);
  });
});
