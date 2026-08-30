/**
 * Optimal attribute allocation for a contiguous plan segment.
 *
 * EVE remap rules (EVE University wiki, "Skills and learning" / Neural Remap):
 * 99 base points across 5 attributes, min 17 / max 27 each, i.e. 14 freely
 * allocatable points. Implants add on top and are unaffected by a remap.
 * Boosters are accounted for when a `BoosterContext` is supplied, matching
 * `computeSchedule` — a long accelerator runs to weeks, so ignoring one gives
 * the wrong optimum for weeks of training (plan §5.5). `placeRemaps` passes a
 * context whenever the character has a Booster enabled.
 */
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import type {
  AttributeName,
  Attributes,
  Booster,
  EngineSkill,
  Implants,
  PlanStep,
} from '@/engine/types';

export const ATTRIBUTE_NAMES: readonly AttributeName[] = [
  'intelligence',
  'memory',
  'perception',
  'willpower',
  'charisma',
];

const BASE_MIN = 17;
const FREE_POINTS = 14;
const MAX_EXTRA = 10; // 27 - 17

/** Fresh-character default spread; returned for empty segments. */
const DEFAULT_ATTRIBUTES: Attributes = {
  intelligence: 20,
  memory: 20,
  perception: 20,
  willpower: 20,
  charisma: 19,
};

export interface BestAttributesResult {
  attributes: Attributes;
  seconds: number;
}

/** SP totals keyed by `${primary}|${secondary}`. */
export type SpByPair = ReadonlyMap<string, number>;

export function pairKey(primary: AttributeName, secondary: AttributeName): string {
  return `${primary}|${secondary}`;
}

/** Sum segment SP per (primary, secondary) attribute pair. */
export function aggregateSpByPair(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>
): Map<string, number> {
  const spByPair = new Map<string, number>();
  for (const step of steps) {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const key = pairKey(skill.primary, skill.secondary);
    const sp = spBetween(skill.rank, step.level - 1, step.level);
    spByPair.set(key, (spByPair.get(key) ?? 0) + sp);
  }
  return spByPair;
}

/** All ways to spread the 14 free points over 5 attributes (cap 10 each). */
let allocationsCache: readonly (readonly number[])[] | null = null;
function allAllocations(): readonly (readonly number[])[] {
  if (allocationsCache) return allocationsCache;
  const result: number[][] = [];
  for (let a = 0; a <= MAX_EXTRA; a++)
    for (let b = 0; b <= MAX_EXTRA; b++)
      for (let c = 0; c <= MAX_EXTRA; c++)
        for (let d = 0; d <= MAX_EXTRA; d++) {
          const e = FREE_POINTS - a - b - c - d;
          if (e >= 0 && e <= MAX_EXTRA) result.push([a, b, c, d, e]);
        }
  allocationsCache = result;
  return result;
}

function toAttributes(extras: readonly number[]): Attributes {
  const attributes = {} as Attributes;
  ATTRIBUTE_NAMES.forEach((name, i) => {
    attributes[name] = BASE_MIN + extras[i];
  });
  return attributes;
}

/** `'primary|secondary'` as the two indices into `ATTRIBUTE_NAMES`. */
function pairIndices(key: string): { primary: number; secondary: number } {
  const [primary, secondary] = key.split('|') as [AttributeName, AttributeName];
  return {
    primary: ATTRIBUTE_NAMES.indexOf(primary),
    secondary: ATTRIBUTE_NAMES.indexOf(secondary),
  };
}

/**
 * Training rate for one pair under one allocation.
 *
 * The one place the formula lives. Both allocation searches call it, and they
 * have to agree: the table below CHOOSES a segment that
 * `bestAttributesForPairs` then RE-PRICES for display, so an edit landing in
 * only one of them would make the chosen segment and the reported duration
 * disagree silently. Only the rate is shared — how each turns it into seconds
 * differs, and that difference is load-bearing (see the table's docblock).
 */
function rateFor(
  extras: readonly number[],
  implantByIndex: readonly number[],
  primary: number,
  secondary: number
): number {
  return trainingRate(
    BASE_MIN + extras[primary] + implantByIndex[primary],
    BASE_MIN + extras[secondary] + implantByIndex[secondary]
  );
}

/** Brute-force the best allocation for pre-aggregated segment SP. */
export function bestAttributesForPairs(
  spByPair: SpByPair,
  implants: Implants = {}
): BestAttributesResult {
  const pairs: { primary: number; secondary: number; sp: number }[] = [];
  for (const [key, sp] of spByPair) {
    if (sp <= 0) continue;
    pairs.push({ ...pairIndices(key), sp });
  }
  if (pairs.length === 0) return { attributes: { ...DEFAULT_ATTRIBUTES }, seconds: 0 };

  const implantByIndex = ATTRIBUTE_NAMES.map((name) => implants[name] ?? 0);
  let bestSeconds = Infinity;
  let bestExtras: readonly number[] = [];
  for (const extras of allAllocations()) {
    let seconds = 0;
    for (const { primary, secondary, sp } of pairs) {
      seconds += timeToTrain(sp, rateFor(extras, implantByIndex, primary, secondary));
    }
    if (seconds < bestSeconds) {
      bestSeconds = seconds;
      bestExtras = extras;
    }
  }
  return { attributes: toAttributes(bestExtras), seconds: bestSeconds };
}

/**
 * The same brute-force search as `bestAttributesForPairs`, but pulled apart
 * so a caller can price many segments against one allocation.
 *
 * Segment time is linear in SP — `timeToTrain` is `(sp / rate) * 60`, with no
 * rounding — so for a fixed allocation the cost of a segment is just its
 * SP-per-pair vector dotted with this table's row. That is what lets
 * `placeRemaps` pull the choice of allocation outside its search over segment
 * boundaries.
 *
 * The reassociation is deliberate and costs precision: `sp * (60 / rate)`
 * here against `(sp / rate) * 60` there. Callers that report a number to the
 * user should select with this table and then re-price the chosen segment
 * with `bestAttributesForPairs`.
 */
export interface AllocationCostTable {
  /** Candidate allocations — every legal remap spread. */
  count: number;
  /** Row stride: `secondsPerSp[a * width + p]`. */
  width: number;
  /** Seconds per SP, allocation-major. Raw, because callers index it in a hot loop. */
  secondsPerSp: Float64Array;
  /** The attribute spread allocation `a` stands for. */
  attributesAt(a: number): Attributes;
}

export function allocationCostTable(
  pairKeys: readonly string[],
  implants: Implants = {}
): AllocationCostTable {
  const allocations = allAllocations();
  const implantByIndex = ATTRIBUTE_NAMES.map((name) => implants[name] ?? 0);
  const pairs = pairKeys.map(pairIndices);
  const width = pairs.length;
  const secondsPerSp = new Float64Array(allocations.length * width);
  allocations.forEach((extras, a) => {
    pairs.forEach(({ primary, secondary }, p) => {
      secondsPerSp[a * width + p] = timeToTrain(
        1,
        rateFor(extras, implantByIndex, primary, secondary)
      );
    });
  });

  return {
    count: allocations.length,
    width,
    secondsPerSp,
    attributesAt: (a) => toAttributes(allocations[a]),
  };
}

/** Where this segment sits in wall-clock time, and what Boosters are live. */
export interface BoosterContext {
  boosters: readonly Booster[];
  /** When this segment begins training — a Booster's remaining life is measured from here. */
  startDate: Date;
}

/** Merge Booster bonuses into a copy of `implants`, for the uniform case. */
function withBonus(implants: Implants, bonus: Partial<Attributes>): Implants {
  const merged: Implants = { ...implants };
  for (const name of ATTRIBUTE_NAMES) {
    const add = bonus[name] ?? 0;
    if (add) merged[name] = (merged[name] ?? 0) + add;
  }
  return merged;
}

/**
 * Longest this segment can take while fully boosted, over every allocation.
 * Uses the slowest reachable attributes (`BASE_MIN`), so if a Booster outlives
 * this it outlives the segment for *every* candidate allocation — which is
 * what makes the uniform shortcut safe rather than merely usual.
 */
function maxBoostedSeconds(spByPair: SpByPair, boostedImplants: Implants): number {
  let seconds = 0;
  for (const [key, sp] of spByPair) {
    if (sp <= 0) continue;
    const [primary, secondary] = key.split('|') as [AttributeName, AttributeName];
    seconds += timeToTrain(
      sp,
      trainingRate(
        BASE_MIN + (boostedImplants[primary] ?? 0),
        BASE_MIN + (boostedImplants[secondary] ?? 0)
      )
    );
  }
  return seconds;
}

/**
 * Brute force with a Booster expiring mid-segment.
 *
 * The pair aggregation above is order-independent, which a mid-segment expiry
 * breaks: the rate a step trains at depends on *when* it trains. So walk the
 * steps in order while the Booster is live, then hand the constant-rate tail
 * back to the aggregation. Suffix SP-per-pair sums are precomputed once, so
 * the tail costs O(pairs) at any plan length and only the boosted prefix is
 * walked — that prefix is bounded by the Booster window, not by plan length.
 *
 * Matches `computeSchedule`'s semantics exactly, including the strict `<`
 * on expiry; a test cross-checks the two.
 */
function bestAttributesWalking(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants,
  bonus: Partial<Attributes>,
  expirySeconds: number
): BestAttributesResult {
  const stepSp: number[] = [];
  const stepPrimary: AttributeName[] = [];
  const stepSecondary: AttributeName[] = [];
  for (const step of steps) {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    stepSp.push(spBetween(skill.rank, step.level - 1, step.level));
    stepPrimary.push(skill.primary);
    stepSecondary.push(skill.secondary);
  }

  const keys = [...new Set(steps.map((_, i) => pairKey(stepPrimary[i], stepSecondary[i])))];
  const keyAt = new Map(keys.map((k, i) => [k, i]));
  const keyPairs = keys.map((k) => k.split('|') as [AttributeName, AttributeName]);
  // suffix[i][k] = SP of pair k across steps i..end.
  const suffix: number[][] = Array.from({ length: steps.length + 1 }, () =>
    new Array<number>(keys.length).fill(0)
  );
  for (let i = steps.length - 1; i >= 0; i--) {
    const row = suffix[i];
    const next = suffix[i + 1];
    for (let k = 0; k < keys.length; k++) row[k] = next[k];
    row[keyAt.get(pairKey(stepPrimary[i], stepSecondary[i]))!] += stepSp[i];
  }

  const implantOf = (n: AttributeName) => implants[n] ?? 0;
  const bonusOf = (n: AttributeName) => bonus[n] ?? 0;

  let bestSeconds = Infinity;
  let bestExtras: readonly number[] = [];

  for (const extras of allAllocations()) {
    const value = (n: AttributeName, boosted: boolean) =>
      BASE_MIN + extras[ATTRIBUTE_NAMES.indexOf(n)] + implantOf(n) + (boosted ? bonusOf(n) : 0);

    let elapsed = 0;
    let i = 0;
    for (; i < steps.length && elapsed < expirySeconds; i++) {
      let spLeft = stepSp[i];
      while (spLeft > 0 && elapsed < expirySeconds) {
        const rate = trainingRate(value(stepPrimary[i], true), value(stepSecondary[i], true));
        const needed = timeToTrain(spLeft, rate);
        const room = expirySeconds - elapsed;
        if (needed <= room) {
          elapsed += needed;
          spLeft = 0;
        } else {
          elapsed += room;
          spLeft -= (rate / 60) * room;
        }
      }
      if (spLeft > 0) {
        // The Booster lapsed mid-step: finish this one unboosted, then the
        // rest of the segment is constant-rate and can be aggregated.
        elapsed += timeToTrain(
          spLeft,
          trainingRate(value(stepPrimary[i], false), value(stepSecondary[i], false))
        );
        i++;
        break;
      }
    }

    const tail = suffix[Math.min(i, steps.length)];
    // Pruning: once the running total passes the incumbent this allocation
    // cannot win, and `elapsed` only grows — so bailing leaves it above
    // `bestSeconds`, which the check below then rejects.
    for (let k = 0; k < keyPairs.length && elapsed < bestSeconds; k++) {
      const sp = tail[k];
      if (sp <= 0) continue;
      const [primary, secondary] = keyPairs[k];
      elapsed += timeToTrain(sp, trainingRate(value(primary, false), value(secondary, false)));
    }

    if (elapsed < bestSeconds) {
      bestSeconds = elapsed;
      bestExtras = extras;
    }
  }
  return { attributes: toAttributes(bestExtras), seconds: bestSeconds };
}

/**
 * Best remap allocation for a contiguous segment of plan steps: minimizes
 * total training seconds at base + implant + live-Booster rates.
 *
 * Three cases, and only the third is expensive:
 * - no Booster still live at `startDate` → plain pair aggregation;
 * - a Booster outlasting the segment → fold it into implants, same fast path;
 * - a Booster expiring mid-segment → the ordered walk above.
 */
export function bestAttributes(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants = {},
  booster?: BoosterContext
): BestAttributesResult {
  const spByPair = aggregateSpByPair(steps, skills);
  if (!booster || booster.boosters.length === 0) {
    return bestAttributesForPairs(spByPair, implants);
  }

  const startMs = booster.startDate.getTime();
  const live = booster.boosters.filter((b) => b.expiresAt.getTime() > startMs);
  if (live.length === 0) return bestAttributesForPairs(spByPair, implants);

  // Stacked bonus, and the first expiry — the only breakpoint that matters
  // while all live Boosters share it. Multiple distinct expiries fall back to
  // the earliest, which under-credits the longer one rather than over-crediting.
  const bonus: Partial<Attributes> = {};
  for (const b of live) {
    for (const name of ATTRIBUTE_NAMES) {
      const add = b.bonus[name] ?? 0;
      if (add) bonus[name] = (bonus[name] ?? 0) + add;
    }
  }
  const expirySeconds = Math.min(...live.map((b) => (b.expiresAt.getTime() - startMs) / 1000));

  const boostedImplants = withBonus(implants, bonus);
  if (expirySeconds >= maxBoostedSeconds(spByPair, boostedImplants)) {
    return bestAttributesForPairs(spByPair, boostedImplants);
  }

  return bestAttributesWalking(steps, skills, implants, bonus, expirySeconds);
}

/**
 * Costs every segment `[startStep, boundary)` that shares a start, in one pass.
 *
 * The DP asks for R segments that all begin at the same run and the same
 * wall-clock offset, differing only in where they end. Answering those
 * separately re-walks the same boosted prefix R times, which is what takes
 * `remapCount = 5` from 2.2 s to 21.7 s. Walking once per allocation and
 * recording the running total at each boundary collapses that to a single
 * pass, since a segment's cost is just the walk's elapsed time at its end.
 *
 * `boundaries` are exclusive end indices into `steps`, ascending. Returns one
 * result per boundary, in the same order.
 */
export function bestAttributesAtBoundaries(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants,
  booster: BoosterContext,
  startStep: number,
  boundaries: readonly number[]
): BestAttributesResult[] {
  const bonus: Partial<Attributes> = {};
  const startMs = booster.startDate.getTime();
  const live = booster.boosters.filter((b) => b.expiresAt.getTime() > startMs);
  for (const b of live) {
    for (const name of ATTRIBUTE_NAMES) {
      const add = b.bonus[name] ?? 0;
      if (add) bonus[name] = (bonus[name] ?? 0) + add;
    }
  }
  const expirySeconds =
    live.length > 0
      ? Math.min(...live.map((b) => (b.expiresAt.getTime() - startMs) / 1000))
      : -Infinity;

  const end = boundaries[boundaries.length - 1];
  const sp: number[] = [];
  const primary: AttributeName[] = [];
  const secondary: AttributeName[] = [];
  for (let i = startStep; i < end; i++) {
    const skill = skills.get(steps[i].skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${steps[i].skillTypeID}`);
    sp.push(spBetween(skill.rank, steps[i].level - 1, steps[i].level));
    primary.push(skill.primary);
    secondary.push(skill.secondary);
  }

  const bestSeconds = boundaries.map(() => Infinity);
  const bestExtras: (readonly number[])[] = boundaries.map(() => []);

  for (const extras of allAllocations()) {
    const value = (n: AttributeName, boosted: boolean) =>
      BASE_MIN +
      extras[ATTRIBUTE_NAMES.indexOf(n)] +
      (implants[n] ?? 0) +
      (boosted ? (bonus[n] ?? 0) : 0);

    let elapsed = 0;
    let b = 0;
    for (let i = 0; i < sp.length; i++) {
      // A boundary can sit before this step (an empty segment) or between any
      // two, so drain every boundary the cursor has reached before advancing.
      while (b < boundaries.length && boundaries[b] === startStep + i) {
        if (elapsed < bestSeconds[b]) {
          bestSeconds[b] = elapsed;
          bestExtras[b] = extras;
        }
        b++;
      }
      let spLeft = sp[i];
      while (spLeft > 0) {
        const boosted = elapsed < expirySeconds;
        const rate = trainingRate(value(primary[i], boosted), value(secondary[i], boosted));
        const needed = timeToTrain(spLeft, rate);
        const room = boosted ? expirySeconds - elapsed : Infinity;
        if (needed <= room) {
          elapsed += needed;
          spLeft = 0;
        } else {
          elapsed += room;
          spLeft -= (rate / 60) * room;
        }
      }
    }
    while (b < boundaries.length) {
      if (elapsed < bestSeconds[b]) {
        bestSeconds[b] = elapsed;
        bestExtras[b] = extras;
      }
      b++;
    }
  }

  return boundaries.map((_, b) => ({
    attributes: toAttributes(bestExtras[b]),
    seconds: bestSeconds[b],
  }));
}
