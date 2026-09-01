import { describe, it, expect } from 'vitest';
import { bestAttributes } from '@/engine/optimizer/bestAttributes';
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import { placeRemaps, MAX_SUPPORTED_REMAPS } from '@/engine/optimizer/placeRemaps';
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

    // Brute force: optional current-attributes prefix [0, p) at no remap
    // cost, then 1 or 2 remapped segments over the rest.
    const currentSecondsFor = (slice: PlanStep[]): number => {
      let seconds = 0;
      for (const step of slice) {
        const s = skills.get(step.skillTypeID)!;
        const sp = spBetween(s.rank, step.level - 1, step.level);
        seconds += (sp / (CURRENT[s.primary] + CURRENT[s.secondary] / 2)) * 60;
      }
      return seconds;
    };
    let best = Infinity;
    for (let p = 0; p <= steps.length; p++) {
      const prefix = currentSecondsFor(steps.slice(0, p));
      const rest = steps.slice(p);
      if (rest.length === 0) {
        best = Math.min(best, prefix);
        continue;
      }
      best = Math.min(best, prefix + bestAttributes(rest, skills).seconds);
      for (let cut = 1; cut < rest.length; cut++) {
        const t =
          prefix +
          bestAttributes(rest.slice(0, cut), skills).seconds +
          bestAttributes(rest.slice(cut), skills).seconds;
        if (t < best) best = t;
      }
    }
    expect(result.totalSeconds).toBeCloseTo(best, 6);
  });

  it.each([3, 5])('handles a 200-step plan quickly at remapCount %i', (remapCount) => {
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
    const result = placeRemaps(steps, skills, { remapCount, currentAttributes: CURRENT });
    // 500 ms, not the 3 s this used to allow: the O(R^2) grid took ~2.0 s
    // here, so the old bound passed before the fix and guarded nothing.
    // Measured ~13 ms at remapCount 3 and ~21 ms at 5, so this has room for a
    // slow machine while still failing if the grid ever comes back.
    expect(performance.now() - start).toBeLessThan(500);
    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    // Up to `remapCount` remapped segments plus an optional prefix.
    expect(result.segments.length).toBeLessThanOrEqual(remapCount + 1);
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
  // ESI-style values: implant bonuses baked in (sum 139 > 99, unreachable by
  // remap). Every pair trains faster on these than on any legal allocation
  // (max reachable rate with +4 implants is 31 + 25/2 = 43.5), so no split —
  // not even a remap on a late segment after a current-attributes prefix —
  // can help.
  const inflated: Attributes = {
    intelligence: 29,
    memory: 27,
    perception: 31,
    willpower: 25,
    charisma: 27,
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

// Leading current-attributes segment: with N remaps the optimizer may train a
// prefix on the CURRENT attributes (no remap spent) and remap mid-plan. The
// single-remap case answers "where do I remap".
describe('placeRemaps leading current-attributes segment', () => {
  it('N=1: trains the early int/mem phase on current attributes and remaps mid-plan', () => {
    const skills = skillMap(
      skill(1, 'intelligence', 'memory'),
      skill(2, 'perception', 'willpower')
    );
    // Current attributes are already optimal for the int/mem phase.
    const current: Attributes = {
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      charisma: 17,
    };
    const steps = [...levels(1, 3), ...levels(2, 3)]; // 8000 SP each phase
    const result = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: current });

    expect(result.segments).toHaveLength(2);
    // Segment 0: the current-attributes prefix, no remap spent.
    expect(result.segments[0]).toMatchObject({ startIndex: 0, endIndex: 2, remap: false });
    expect(result.segments[0].attributes).toEqual(current);
    // Segment 1: the single remap, placed mid-plan for the per/wil phase.
    expect(result.segments[1]).toMatchObject({ startIndex: 3, endIndex: 5, remap: true });
    expect(result.segments[1].attributes.perception).toBe(27);
    expect(result.segments[1].attributes.willpower).toBe(21);
    // Both phases at the optimal 37.5 SP/min: 8000/37.5 min each.
    expect(result.totalSeconds).toBeCloseTo(2 * (8000 / 37.5) * 60, 6);
    expect(result.totalSeconds).toBeLessThanOrEqual(result.currentSeconds);
    expect(result.savingsSeconds).toBeCloseTo(result.currentSeconds - result.totalSeconds, 6);
  });

  it('flags remapped segments remap: true and the no-remap fallback remap: false', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower'));
    const remapped = placeRemaps(levels(1, 3), skills, {
      remapCount: 1,
      currentAttributes: CURRENT,
    });
    expect(remapped.segments).toHaveLength(1);
    expect(remapped.segments[0].remap).toBe(true);

    const noRemap = placeRemaps(levels(1, 3), skills, {
      remapCount: 0,
      currentAttributes: CURRENT,
    });
    expect(noRemap.segments[0].remap).toBe(false);
  });

  it('matches brute force including current-prefix splits (N=1)', () => {
    const skills = skillMap(
      skill(1, 'intelligence', 'memory'),
      skill(2, 'perception', 'willpower'),
      skill(3, 'charisma', 'willpower', 2)
    );
    const current: Attributes = {
      intelligence: 25,
      memory: 21,
      perception: 18,
      willpower: 18,
      charisma: 17,
    };
    const steps: PlanStep[] = [
      { skillTypeID: 1, level: 1 },
      { skillTypeID: 1, level: 2 },
      { skillTypeID: 3, level: 1 },
      { skillTypeID: 2, level: 1 },
      { skillTypeID: 2, level: 2 },
    ];
    const currentSecondsFor = (slice: PlanStep[]): number => {
      let seconds = 0;
      for (const step of slice) {
        const s = skills.get(step.skillTypeID)!;
        const sp = spBetween(s.rank, step.level - 1, step.level);
        seconds += (sp / (current[s.primary] + current[s.secondary] / 2)) * 60;
      }
      return seconds;
    };
    // Brute force: prefix [0, cut) on current attributes + one remap for the rest.
    let best = bestAttributes(steps, skills).seconds; // remap at start
    for (let cut = 1; cut <= steps.length; cut++) {
      const t =
        currentSecondsFor(steps.slice(0, cut)) +
        (cut < steps.length ? bestAttributes(steps.slice(cut), skills).seconds : 0);
      if (t < best) best = t;
    }
    const result = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: current });
    expect(result.totalSeconds).toBeCloseTo(best, 6);
  });
});

// ---------------------------------------------------------------------------
// Single-remap (remapCount === 1) fast path.
//
// remapCount === 1 is the case CONTEXT.md calls out ("train a leading segment
// on current attributes, then remap at the optimizer-chosen point") and the
// prefilled default in the UI. Only the last DP column is reachable with one
// allocation, so the answer is an O(R) suffix scan over pair-run edges rather
// than the O(R^2) segment grid. These tests pin that the fast path is an exact
// substitute for the general DP, not an approximation.
// ---------------------------------------------------------------------------
import {
  aggregateSpByPair,
  bestAttributesForPairs,
  pairKey,
} from '@/engine/optimizer/bestAttributes';
import type { Implants } from '@/engine/types';
import type { PlaceRemapsResult } from '@/engine/optimizer/placeRemaps';

/**
 * Independent specification of "one remap, placed anywhere": enumerate every
 * pair-run edge, train the prefix on the current attributes, remap once for
 * the whole suffix, keep the cheapest. Tie-break: the EARLIEST edge wins.
 */
function referenceSingleRemap(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  currentAttributes: Attributes,
  implants: Implants = {}
): PlaceRemapsResult & { chosenRunIndex: number; edgeTotals: number[] } {
  if (steps.length === 0) {
    return {
      segments: [],
      totalSeconds: 0,
      currentSeconds: 0,
      savingsSeconds: 0,
      chosenRunIndex: -1,
      edgeTotals: [],
    };
  }

  // Pair runs + per-run baseline on the current attributes.
  const runs: { startStep: number; endStep: number; pair: string; seconds: number }[] = [];
  let currentSeconds = 0;
  steps.forEach((step, index) => {
    const s = skills.get(step.skillTypeID)!;
    const sp = spBetween(s.rank, step.level - 1, step.level);
    const rate =
      currentAttributes[s.primary] +
      (implants[s.primary] ?? 0) +
      (currentAttributes[s.secondary] + (implants[s.secondary] ?? 0)) / 2;
    const seconds = (sp / rate) * 60;
    currentSeconds += seconds;
    const pair = pairKey(s.primary, s.secondary);
    const last = runs[runs.length - 1];
    if (last && last.pair === pair) {
      last.endStep = index;
      last.seconds += seconds;
    } else {
      runs.push({ startStep: index, endStep: index, pair, seconds });
    }
  });

  const currentPrefix = [0];
  runs.forEach((run, i) => currentPrefix.push(currentPrefix[i] + run.seconds));

  const edgeTotals: number[] = [];
  let bestSeconds = Infinity;
  let bestI = -1;
  for (let i = 0; i < runs.length; i++) {
    const best = bestAttributesForPairs(
      aggregateSpByPair(steps.slice(runs[i].startStep), skills),
      implants
    );
    const total = currentPrefix[i] + best.seconds;
    edgeTotals.push(total);
    if (total < bestSeconds) {
      bestSeconds = total;
      bestI = i;
    }
  }

  const tieBound = bestSeconds + Math.max(1e-6, bestSeconds * 1e-9);
  if (currentSeconds <= tieBound) {
    return {
      segments: [
        {
          startIndex: 0,
          endIndex: steps.length - 1,
          attributes: { ...currentAttributes },
          seconds: currentSeconds,
          remap: false,
        },
      ],
      totalSeconds: currentSeconds,
      currentSeconds,
      savingsSeconds: 0,
      chosenRunIndex: -1,
      edgeTotals,
    };
  }

  const best = bestAttributesForPairs(
    aggregateSpByPair(steps.slice(runs[bestI].startStep), skills),
    implants
  );
  const segments = [
    {
      startIndex: runs[bestI].startStep,
      endIndex: runs[runs.length - 1].endStep,
      attributes: best.attributes,
      seconds: best.seconds,
      remap: true,
    },
  ];
  let totalSeconds = best.seconds;
  if (bestI > 0) {
    segments.unshift({
      startIndex: 0,
      endIndex: runs[bestI - 1].endStep,
      attributes: { ...currentAttributes },
      seconds: currentPrefix[bestI],
      remap: false,
    });
    totalSeconds += currentPrefix[bestI];
  }
  return {
    segments,
    totalSeconds,
    currentSeconds,
    savingsSeconds: currentSeconds - totalSeconds,
    chosenRunIndex: bestI,
    edgeTotals,
  };
}

/** Deterministic PRNG so generated plan shapes are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ALL_PAIRS: [AttributeName, AttributeName][] = [
  ['perception', 'willpower'],
  ['intelligence', 'memory'],
  ['memory', 'intelligence'],
  ['willpower', 'perception'],
  ['charisma', 'willpower'],
  ['intelligence', 'perception'],
  ['memory', 'charisma'],
];

/**
 * Plan with `runs` pair runs. `stepsPerRun > 1` exercises multi-step runs
 * (segment boundaries must still land on run edges); distinct ranks keep the
 * segment-signature memo from collapsing the work.
 */
function generatePlan(
  runCount: number,
  seed: number,
  stepsPerRun = 1
): { steps: PlanStep[]; skills: Map<number, EngineSkill> } {
  const rand = mulberry32(seed);
  const skills = new Map<number, EngineSkill>();
  const steps: PlanStep[] = [];
  let previousPair = -1;
  for (let r = 0; r < runCount; r++) {
    let pairIndex = Math.floor(rand() * ALL_PAIRS.length);
    if (pairIndex === previousPair) pairIndex = (pairIndex + 1) % ALL_PAIRS.length;
    previousPair = pairIndex;
    const [primary, secondary] = ALL_PAIRS[pairIndex];
    const typeID = r + 1;
    skills.set(typeID, {
      typeID,
      name: `S${typeID}`,
      rank: 1 + Math.floor(rand() * 8),
      primary,
      secondary,
      prereqs: [],
    });
    for (let k = 0; k < stepsPerRun; k++) {
      steps.push({ skillTypeID: typeID, level: 1 + Math.floor(rand() * 5) });
    }
  }
  return { steps, skills };
}

/**
 * Seconds to train `steps` on one fixed attribute spread. The reference below
 * needs a cost function that shares nothing with the DP under test.
 */
function trainSeconds(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  attributes: Attributes
): number {
  let total = 0;
  for (const step of steps) {
    const skill = skills.get(step.skillTypeID)!;
    total += timeToTrain(
      spBetween(skill.rank, step.level - 1, step.level),
      trainingRate(attributes[skill.primary], attributes[skill.secondary])
    );
  }
  return total;
}

describe('placeRemaps general DP', () => {
  /**
   * Every way to cut the plan into a current-attributes prefix plus at most
   * `remaps` remapped segments, over STEP boundaries rather than run edges —
   * a strictly wider search than the DP does, so it cannot miss an optimum
   * the DP finds, and it shares no code with it.
   */
  function bruteForce(
    steps: readonly PlanStep[],
    skills: ReadonlyMap<number, EngineSkill>,
    remaps: number
  ): number {
    const n = steps.length;
    let best = trainSeconds(steps, skills, CURRENT); // spend no remap at all
    for (let i = 0; i <= n; i++) {
      const prefix = trainSeconds(steps.slice(0, i), skills, CURRENT);
      if (i === n) continue;
      best = Math.min(best, prefix + bestAttributes(steps.slice(i), skills).seconds);
      if (remaps < 2) continue;
      for (let j = i + 1; j < n; j++) {
        const head = prefix + bestAttributes(steps.slice(i, j), skills).seconds;
        best = Math.min(best, head + bestAttributes(steps.slice(j), skills).seconds);
        if (remaps < 3) continue;
        for (let k = j + 1; k < n; k++) {
          best = Math.min(
            best,
            head +
              bestAttributes(steps.slice(j, k), skills).seconds +
              bestAttributes(steps.slice(k), skills).seconds
          );
        }
      }
    }
    return best;
  }

  for (const remapCount of [2, 3]) {
    it(`finds the true optimum at remapCount ${remapCount}`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const { steps, skills } = generatePlan(4, seed, 2);
        const result = placeRemaps(steps, skills, { remapCount, currentAttributes: CURRENT });
        expect(result.totalSeconds).toBeCloseTo(bruteForce(steps, skills, remapCount), 3);

        // Segments tile the plan exactly, in order.
        let next = 0;
        for (const segment of result.segments) {
          expect(segment.startIndex).toBe(next);
          next = segment.endIndex + 1;
        }
        expect(next).toBe(steps.length);
        expect(result.totalSeconds).toBeCloseTo(
          result.segments.reduce((acc, segment) => acc + segment.seconds, 0),
          6
        );
      }
    });
  }

  it('spends a second remap only when it earns its place', () => {
    // A plan of one attribute pair has one optimal spread, so the DP must
    // report the single segment rather than pad out to `remapCount`.
    const skills = skillMap(skill(1, 'perception', 'willpower', 5));
    const steps = levels(1, 5);
    const result = placeRemaps(steps, skills, { remapCount: 3, currentAttributes: CURRENT });
    expect(result.segments.filter((segment) => segment.remap)).toHaveLength(1);
  });

  it('is deterministic across repeated calls', () => {
    const { steps, skills } = generatePlan(9, 42, 2);
    const options = { remapCount: 3, currentAttributes: CURRENT };
    expect(placeRemaps(steps, skills, options)).toEqual(placeRemaps(steps, skills, options));
  });
});

describe('placeRemaps single-remap fast path', () => {
  const CURRENT_VARIANTS: { name: string; attributes: Attributes; implants?: Implants }[] = [
    { name: 'fresh-character spread', attributes: CURRENT },
    {
      name: 'int-heavy legal spread',
      attributes: {
        intelligence: 27,
        memory: 21,
        perception: 17,
        willpower: 17,
        charisma: 17,
      },
    },
    {
      name: 'per/wil spread with +4 implants',
      attributes: {
        intelligence: 17,
        memory: 17,
        perception: 27,
        willpower: 21,
        charisma: 17,
      },
      implants: {
        intelligence: 4,
        memory: 4,
        perception: 4,
        willpower: 4,
        charisma: 4,
      },
    },
    {
      name: 'ESI-inflated attributes outside 17..27',
      attributes: {
        intelligence: 29,
        memory: 27,
        perception: 31,
        willpower: 25,
        charisma: 27,
      },
      implants: {
        intelligence: 4,
        memory: 4,
        perception: 4,
        willpower: 4,
        charisma: 4,
      },
    },
  ];

  const SHAPES: { runCount: number; stepsPerRun: number }[] = [
    { runCount: 1, stepsPerRun: 1 },
    { runCount: 1, stepsPerRun: 5 },
    { runCount: 2, stepsPerRun: 1 },
    { runCount: 2, stepsPerRun: 6 },
    { runCount: 3, stepsPerRun: 4 },
    { runCount: 7, stepsPerRun: 1 },
    { runCount: 11, stepsPerRun: 3 },
    { runCount: 23, stepsPerRun: 1 },
    { runCount: 40, stepsPerRun: 2 },
  ];

  for (const variant of CURRENT_VARIANTS) {
    for (const shape of SHAPES) {
      it(`matches the run-edge specification exactly: ${variant.name}, R=${shape.runCount} x ${shape.stepsPerRun}`, () => {
        const { steps, skills } = generatePlan(
          shape.runCount,
          shape.runCount * 31 + variant.name.length,
          shape.stepsPerRun
        );
        const expected = referenceSingleRemap(
          steps,
          skills,
          variant.attributes,
          variant.implants ?? {}
        );
        const actual = placeRemaps(steps, skills, {
          remapCount: 1,
          currentAttributes: variant.attributes,
          implants: variant.implants,
        });

        // Field-for-field, bit-for-bit: placement, attributes and durations.
        expect(actual.segments).toEqual(expected.segments);
        expect(actual.totalSeconds).toBe(expected.totalSeconds);
        expect(actual.currentSeconds).toBe(expected.currentSeconds);
        expect(actual.savingsSeconds).toBe(expected.savingsSeconds);
      });
    }
  }

  it('picks the earliest run edge among equal-cost placements', () => {
    // Ties between distinct placements are float-exact coincidences, so this
    // asserts the rule over generated data: whichever edges tie, the chosen
    // one is the first minimiser.
    for (let seed = 1; seed <= 12; seed++) {
      const { steps, skills } = generatePlan(9, seed, seed % 3 === 0 ? 2 : 1);
      const expected = referenceSingleRemap(steps, skills, CURRENT);
      if (expected.chosenRunIndex < 0) continue; // no-remap case
      const min = Math.min(...expected.edgeTotals);
      const earliestMinimiser = expected.edgeTotals.findIndex((t) => t === min);
      expect(expected.chosenRunIndex).toBe(earliestMinimiser);

      const actual = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
      const remapped = actual.segments.find((s) => s.remap);
      expect(remapped).toBeDefined();
      expect(remapped!.startIndex).toBe(expected.segments.find((s) => s.remap)!.startIndex);
    }
  });

  it('is deterministic across repeated calls', () => {
    const { steps, skills } = generatePlan(17, 99, 2);
    const a = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
    const b = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
    expect(a).toEqual(b);
  });

  it('handles R = 0 (empty plan)', () => {
    const result = placeRemaps([], skillMap(), { remapCount: 1, currentAttributes: CURRENT });
    expect(result).toEqual({
      segments: [],
      totalSeconds: 0,
      currentSeconds: 0,
      savingsSeconds: 0,
    });
  });

  it('handles R = 1 (a single pair run) with one remapped segment', () => {
    const skills = skillMap(skill(1, 'perception', 'willpower', 3));
    const steps = levels(1, 4);
    const result = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0]).toMatchObject({
      startIndex: 0,
      endIndex: steps.length - 1,
      remap: true,
    });
    expect(result.segments[0].attributes.perception).toBe(27);
    const expected = referenceSingleRemap(steps, skills, CURRENT);
    expect(result.segments).toEqual(expected.segments);
    expect(result.totalSeconds).toBe(expected.totalSeconds);
    expect(result.savingsSeconds).toBe(expected.savingsSeconds);
  });

  it('keeps the no-remap result when no placement helps', () => {
    const skills = skillMap(
      skill(1, 'perception', 'willpower'),
      skill(2, 'intelligence', 'memory', 3),
      skill(3, 'willpower', 'perception', 2)
    );
    const steps = [...levels(1, 4), ...levels(2, 3), ...levels(3, 2)];
    const implants: Implants = {
      intelligence: 4,
      memory: 4,
      perception: 4,
      willpower: 4,
      charisma: 4,
    };
    const inflated: Attributes = {
      intelligence: 29,
      memory: 27,
      perception: 31,
      willpower: 25,
      charisma: 27,
    };
    const result = placeRemaps(steps, skills, {
      remapCount: 1,
      currentAttributes: inflated,
      implants,
    });
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].remap).toBe(false);
    expect(result.segments[0].attributes).toEqual(inflated);
    expect(result.savingsSeconds).toBe(0);
    expect(result.totalSeconds).toBe(result.currentSeconds);
  });

  it('leaves the remapCount >= 2 path on the general DP', () => {
    // Three distinct attribute phases: two remaps must beat one, and the DP
    // must still be able to return more segments than the fast path can.
    const skills = skillMap(
      skill(1, 'intelligence', 'memory'),
      skill(2, 'perception', 'willpower'),
      skill(3, 'charisma', 'willpower', 2)
    );
    const current: Attributes = {
      intelligence: 27,
      memory: 21,
      perception: 17,
      willpower: 17,
      charisma: 17,
    };
    const steps = [...levels(1, 4), ...levels(2, 4), ...levels(3, 4)];
    const one = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: current });
    const two = placeRemaps(steps, skills, { remapCount: 2, currentAttributes: current });
    expect(one.segments.filter((s) => s.remap)).toHaveLength(1);
    expect(two.segments.filter((s) => s.remap).length).toBeGreaterThan(1);
    expect(two.totalSeconds).toBeLessThan(one.totalSeconds);
    expect(one.currentSeconds).toBe(two.currentSeconds);
  });

  it('stays linear in pair runs: 200 runs with one remap', () => {
    // Generous ceiling: the O(R^2) grid took ~3.8 s at R = 145 and ~10 s at
    // R = 236 on the dev machine, the suffix scan ~50-90 ms. This catches a
    // regression back to the grid without asserting a tight timing.
    const { steps, skills } = generatePlan(200, 4242);
    const start = performance.now();
    const result = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
    const elapsed = performance.now() - start;
    expect(result.segments.length).toBeGreaterThanOrEqual(1);
    expect(elapsed).toBeLessThan(2500);
  }, 120000);
});

describe('placeRemaps with Boosters', () => {
  const START = new Date('2026-08-30T00:00:00Z');
  const after = (seconds: number) => new Date(START.getTime() + seconds * 1000);
  const skills = skillMap(
    skill(1, 'perception', 'willpower', 5),
    skill(2, 'intelligence', 'memory', 5),
    skill(3, 'charisma', 'willpower', 5)
  );
  const steps: PlanStep[] = [...levels(1, 4), ...levels(2, 4), ...levels(3, 3)];
  const bonus = {
    intelligence: 12,
    memory: 12,
    perception: 12,
    willpower: 12,
    charisma: 12,
  };

  it('does not let a short extra Booster make the answer worse, at every supported remap count', () => {
    // Two Boosters with different expiries are now credited piecewise, each
    // for its own lifetime, so adding a short extra Booster on top of a long
    // one must never cost more than the long one alone — at any remap count
    // the planner evaluates, not just remapCount 1.
    const long = { bonus, expiresAt: after(5_000_000) };
    const short = { bonus: { charisma: 3 }, expiresAt: after(60) };
    for (let remapCount = 1; remapCount <= MAX_SUPPORTED_REMAPS; remapCount++) {
      const one = placeRemaps(steps, skills, {
        remapCount,
        currentAttributes: CURRENT,
        booster: { boosters: [long], startDate: START },
      });
      const two = placeRemaps(steps, skills, {
        remapCount,
        currentAttributes: CURRENT,
        booster: { boosters: [long, short], startDate: START },
      });
      expect(two.totalSeconds).toBeLessThanOrEqual(one.totalSeconds + 1e-6);
    }
  });

  it('leaves the Booster-blind result untouched when no context is passed', () => {
    const blind = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
    const empty = placeRemaps(steps, skills, {
      remapCount: 1,
      currentAttributes: CURRENT,
      booster: { boosters: [], startDate: START },
    });
    expect(empty.totalSeconds).toBeCloseTo(blind.totalSeconds, 9);
    expect(empty.currentSeconds).toBeCloseTo(blind.currentSeconds, 9);
  });

  it('makes the no-remap baseline faster, because the Booster speeds training up', () => {
    // currentSeconds is what the savings figure is measured against. If it
    // ignored the Booster the app would advertise savings it cannot deliver.
    const blind = placeRemaps(steps, skills, { remapCount: 1, currentAttributes: CURRENT });
    const withBooster = placeRemaps(steps, skills, {
      remapCount: 1,
      currentAttributes: CURRENT,
      booster: { boosters: [{ bonus, expiresAt: after(1e9) }], startDate: START },
    });
    expect(withBooster.currentSeconds).toBeLessThan(blind.currentSeconds);
  });

  it('reports, for every segment, the time computeSchedule says that segment takes', async () => {
    // The load-bearing check. Each segment starts where the previous one
    // ended, so its remaining Booster life differs — training its own steps on
    // its own attributes, with the Booster shifted by that offset, must take
    // exactly the seconds it reported. Blind segment costs fail this.
    const { computeSchedule } = await import('@/engine/schedule');
    const planSeconds = placeRemaps(steps, skills, {
      remapCount: 1,
      currentAttributes: CURRENT,
    }).currentSeconds;

    // Expiry fractions chosen so that later segments — not just the first —
    // begin while the Booster is still live. At 0.1 only segment one straddles
    // it, which would let a bug that ignores each segment's own start offset
    // pass unnoticed.
    for (const fraction of [0.1, 0.5, 0.9]) {
      const boosters = [{ bonus, expiresAt: after(planSeconds * fraction) }];
      for (const remapCount of [1, 2, 3]) {
        const result = placeRemaps(steps, skills, {
          remapCount,
          currentAttributes: CURRENT,
          booster: { boosters, startDate: START },
        });

        let offset = 0;
        for (const segment of result.segments) {
          const slice = steps.slice(segment.startIndex, segment.endIndex + 1);
          const scheduled = computeSchedule(
            slice,
            { attributes: segment.attributes, boosters, startDate: after(offset) },
            skills
          );
          const actual = scheduled[scheduled.length - 1].cumulativeSeconds;
          expect(segment.seconds).toBeCloseTo(actual, 4);
          offset += segment.seconds;
        }
        expect(result.totalSeconds).toBeCloseTo(offset, 4);
      }
    }
  });

  it('never reports savings against a baseline it did not use', () => {
    const boosters = [{ bonus, expiresAt: after(20000) }];
    for (const remapCount of [1, 2, 3]) {
      const r = placeRemaps(steps, skills, {
        remapCount,
        currentAttributes: CURRENT,
        booster: { boosters, startDate: START },
      });
      expect(r.savingsSeconds).toBeCloseTo(r.currentSeconds - r.totalSeconds, 6);
      expect(r.totalSeconds).toBeLessThanOrEqual(r.currentSeconds + 1e-6);
    }
  });

  it('gives the same answer at remapCount 1 whether or not the DP path runs', () => {
    // The reason both paths had to change together: remapCount is a 0..5 user
    // input, so a Booster-aware fast path beside a blind DP would change the
    // answer with the count.
    const boosters = [{ bonus, expiresAt: after(20000) }];
    const opts = { currentAttributes: CURRENT, booster: { boosters, startDate: START } };
    const one = placeRemaps(steps, skills, { ...opts, remapCount: 1 });
    const many = placeRemaps(steps, skills, { ...opts, remapCount: 3 });
    // More remaps can only help; it must never be worse than the single-remap answer.
    expect(many.totalSeconds).toBeLessThanOrEqual(one.totalSeconds + 1e-6);
  });

  it('ignores a Booster that expired before the plan starts', () => {
    const blind = placeRemaps(steps, skills, { remapCount: 2, currentAttributes: CURRENT });
    const expired = placeRemaps(steps, skills, {
      remapCount: 2,
      currentAttributes: CURRENT,
      booster: { boosters: [{ bonus, expiresAt: after(-1) }], startDate: START },
    });
    expect(expired.totalSeconds).toBeCloseTo(blind.totalSeconds, 9);
  });
});
