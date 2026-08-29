import { describe, it, expect } from 'vitest';
import { bestAttributes } from '@/engine/optimizer/bestAttributes';
import { placeRemaps } from '@/engine/optimizer/placeRemaps';
import type { AttributeName, Attributes, EngineSkill, PlanStep } from '@/engine/types';

const skill = (
  typeID: number,
  primary: AttributeName,
  secondary: AttributeName,
  rank = 1
): EngineSkill => ({ typeID, name: `Skill ${typeID}`, rank, primary, secondary, prereqs: [] });

const skillMap = (...list: EngineSkill[]): Map<number, EngineSkill> =>
  new Map(list.map((s) => [s.typeID, s]));

const CURRENT: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

const levels = (skillTypeID: number, upTo: number): PlanStep[] =>
  Array.from({ length: upTo }, (_, i) => ({ skillTypeID, level: i + 1 }));

describe('placeRemaps', () => {
  it('handles an empty plan', () => {
    const result = placeRemaps([], skillMap(), { remapCount: 2, currentAttributes: CURRENT });
    expect(result.segments).toEqual([]);
    expect(result.totalSeconds).toBe(0);
    expect(result.currentSeconds).toBe(0);
    expect(result.savingsSeconds).toBe(0);
  });

  it('uses current attributes as one segment when remapCount is 0', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const steps = levels(1, 1); // 250 SP
    const result = placeRemaps(steps, skills, { remapCount: 0, currentAttributes: CURRENT });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 0 });
    expect(result.segments[0].attributes).toEqual(CURRENT);
    // 250 SP at 20 + 20/2 = 30 SP/min -> 500 s
    expect(result.totalSeconds).toBeCloseTo(500, 9);
    expect(result.currentSeconds).toBeCloseTo(500, 9);
    expect(result.savingsSeconds).toBeCloseTo(0, 9);
  });

  it('optimizes a single step with one remap', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const result = placeRemaps(levels(1, 1), skills, {
      remapCount: 1,
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].attributes.perception).toBe(27);
    expect(result.segments[0].attributes.willpower).toBe(21);
    expect(result.totalSeconds).toBeCloseTo(400, 9);
    expect(result.savingsSeconds).toBeCloseTo(100, 9);
  });

  it('splits a two-phase plan at the pair boundary with two remaps', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory')
    );
    const steps = [...levels(1, 3), ...levels(2, 3)]; // 8000 SP each phase
    const result = placeRemaps(steps, skills, { remapCount: 2, currentAttributes: CURRENT });
    expect(result.segments).toHaveLength(2);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 2 });
    expect(result.segments[1]).toMatchObject({ startIndex: 3, endIndex: 5 });
    expect(result.segments[0].attributes.perception).toBe(27);
    expect(result.segments[1].attributes.intelligence).toBe(27);
    // Each phase: 8000 SP at 37.5 SP/min = 12800 s. Current rate 30 -> 16000 s each.
    expect(result.totalSeconds).toBeCloseTo(25600, 6);
    expect(result.currentSeconds).toBeCloseTo(32000, 6);
    expect(result.savingsSeconds).toBeCloseTo(6400, 6);
  });

  it('leaves extra remaps unused when they add no benefit', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const result = placeRemaps(levels(1, 5), skills, {
      remapCount: 10,
      currentAttributes: CURRENT,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].attributes.perception).toBe(27);

    const skills2 = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory')
    );
    const result2 = placeRemaps([...levels(1, 3), ...levels(2, 3)], skills2, {
      remapCount: 5,
      currentAttributes: CURRENT,
    });
    expect(result2.segments).toHaveLength(2);
  });

  it('covers all steps contiguously and respects attribute bounds', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory', 2),
      skill(3, 'charisma', 'intelligence', 3)
    );
    const steps = [...levels(1, 2), ...levels(2, 3), ...levels(3, 2), ...levels(1, 4).slice(2)];
    const result = placeRemaps(steps, skills, {
      remapCount: 3,
      currentAttributes: CURRENT,
      implants: { perception: 3, willpower: 3 },
    });
    let next = 0;
    for (const seg of result.segments) {
      expect(seg.startIndex).toBe(next);
      expect(seg.endIndex).toBeGreaterThanOrEqual(seg.startIndex);
      next = seg.endIndex + 1;
      let total = 0;
      for (const a of Object.keys(seg.attributes) as AttributeName[]) {
        expect(seg.attributes[a]).toBeGreaterThanOrEqual(17);
        expect(seg.attributes[a]).toBeLessThanOrEqual(27);
        total += seg.attributes[a];
      }
      expect(total).toBe(99);
    }
    expect(next).toBe(steps.length);
    const segSum = result.segments.reduce((acc, s) => acc + s.seconds, 0);
    expect(result.totalSeconds).toBeCloseTo(segSum, 6);
    expect(result.savingsSeconds).toBeCloseTo(result.currentSeconds - result.totalSeconds, 6);
  });

  it('matches brute-force split enumeration on a small plan', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory'),
      skill(3, 'charisma', 'willpower')
    );
    const steps: PlanStep[] = [
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 2, level: 1 },
      { skillTypeID: 3, level: 1 },
      { skillTypeID: 1, level: 2 },
    ];
    const result = placeRemaps(steps, skills, { remapCount: 2, currentAttributes: CURRENT });

    // Brute force: 1 or 2 contiguous segments over 4 steps.
    let best = bestAttributes(steps, skills).seconds;
    for (let cut = 1; cut < steps.length; cut++) {
      const t =
        bestAttributes(steps.slice(0, cut), skills).seconds +
        bestAttributes(steps.slice(cut), skills).seconds;
      if (t < best) best = t;
    }
    expect(result.totalSeconds).toBeCloseTo(best, 6);
  });

  it('handles a 200-step plan quickly', () => {
    const pairs: [AttributeName, AttributeName][] = [
      ['perception', 'willpower'],
      ['intelligence', 'memory'],
      ['memory', 'intelligence'],
      ['willpower', 'perception'],
    ];
    const skills = skillMap(...pairs.map(([p, s], i) => skill(i + 1, p, s, (i % 3) + 1)));
    const steps: PlanStep[] = [];
    for (let i = 0; i < 40; i++) {
      const typeID = (i % 4) + 1;
      for (let level = 1; level <= 5; level++) steps.push({ skillTypeID: typeID, level });
    }
    expect(steps).toHaveLength(200);
    const start = performance.now();
    const result = placeRemaps(steps, skills, { remapCount: 3, currentAttributes: CURRENT });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(result.segments.length).toBeLessThanOrEqual(3);
    expect(result.savingsSeconds).toBeGreaterThan(0);
  });
});

// Regression for the live-review contradiction (UX-REVIEW #2): a real
// character's ESI attributes already include implant bonuses, so the baseline
// fed as `currentAttributes` can sit outside the 17..27 remap search space.
// The optimizer must never return a plan slower than those current attributes.
import { computeSchedule } from '@/engine/schedule';

describe('placeRemaps never beats itself with the current attributes', () => {
  // Mixed attribute pairs, multi-level steps — shaped like a real plan.
  const skills = skillMap(
    skill(1, 'perception', 'willpower'),
    skill(2, 'intelligence', 'memory', 3),
    skill(3, 'willpower', 'perception', 2),
    skill(4, 'memory', 'intelligence'),
    skill(5, 'charisma', 'willpower', 2)
  );
  const steps: PlanStep[] = [
    ...levels(1, 4),
    ...levels(2, 3),
    ...levels(3, 2),
    ...levels(4, 5),
    ...levels(5, 2),
  ];
  const implants: Partial<Attributes> = {
    intelligence: 4,
    memory: 4,
    perception: 4,
    willpower: 4,
    charisma: 4,
  };
  // ESI-style values: implant bonuses baked in (sum 129 > 99, unreachable by remap).
  const inflated: Attributes = {
    intelligence: 29,
    memory: 27,
    perception: 31,
    willpower: 25,
    charisma: 17,
  };

  it.each([1, 2, 3])(
    'with %i remap(s): totalSeconds <= the computeSchedule baseline, savings consistent',
    (remapCount) => {
      const schedule = computeSchedule(steps, { attributes: inflated, implants }, skills);
      const scheduleTotal = schedule[schedule.length - 1].cumulativeSeconds;

      const result = placeRemaps(steps, skills, {
        remapCount,
        currentAttributes: inflated,
        implants,
      });

      expect(result.currentSeconds).toBeCloseTo(scheduleTotal, 6);
      expect(result.totalSeconds).toBeLessThanOrEqual(scheduleTotal + 1e-6);
      expect(result.savingsSeconds).toBeCloseTo(result.currentSeconds - result.totalSeconds, 6);
      expect(result.savingsSeconds).toBeGreaterThanOrEqual(0);
    }
  );

  it('reports zero savings via a single current-attributes segment when no remap helps', () => {
    const result = placeRemaps(steps, skills, {
      remapCount: 2,
      currentAttributes: inflated,
      implants,
    });
    expect(result.savingsSeconds).toBe(0);
    expect(result.totalSeconds).toBe(result.currentSeconds);
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: steps.length - 1 });
    expect(result.segments[0].attributes).toEqual(inflated);
  });

  it('still remaps when the current attributes are a reachable allocation', () => {
    // Legal remap spread (sum 99, each 17..27): the optimizer can only match
    // or beat it, and here the plan is perception-heavy so it must beat it.
    const reachable: Attributes = {
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      charisma: 17,
    };
    const result = placeRemaps(steps, skills, {
      remapCount: 2,
      currentAttributes: reachable,
      implants,
    });
    expect(result.savingsSeconds).toBeGreaterThan(0);
    expect(result.totalSeconds).toBeLessThan(result.currentSeconds);
  });
});
