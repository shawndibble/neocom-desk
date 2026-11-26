import { spBetween, timeToTrain, trainingRate } from '@/engine/skills/sp';
import type {
  AttributeName,
  Attributes,
  Booster,
  CloneState,
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
const MAX_EXTRA = 10;

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

export type SpByPair = ReadonlyMap<string, number>;

export function pairKey(primary: AttributeName, secondary: AttributeName): string {
  return `${primary}|${secondary}`;
}

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

function pairIndices(key: string): { primary: number; secondary: number } {
  const [primary, secondary] = key.split('|') as [AttributeName, AttributeName];
  return {
    primary: ATTRIBUTE_NAMES.indexOf(primary),
    secondary: ATTRIBUTE_NAMES.indexOf(secondary),
  };
}

function rateFor(
  extras: readonly number[],
  implantByIndex: readonly number[],
  primary: number,
  secondary: number,
  cloneState: CloneState
): number {
  return trainingRate(
    BASE_MIN + extras[primary] + implantByIndex[primary],
    BASE_MIN + extras[secondary] + implantByIndex[secondary],
    cloneState
  );
}

export function bestAttributesForPairs(
  spByPair: SpByPair,
  implants: Implants = {},
  cloneState: CloneState = 'omega'
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
      seconds += timeToTrain(sp, rateFor(extras, implantByIndex, primary, secondary, cloneState));
    }
    if (seconds < bestSeconds) {
      bestSeconds = seconds;
      bestExtras = extras;
    }
  }
  return { attributes: toAttributes(bestExtras), seconds: bestSeconds };
}

export interface AllocationCostTable {
  count: number;
  width: number;
  secondsPerSp: Float64Array;
  attributesAt(a: number): Attributes;
}

export function allocationCostTable(
  pairKeys: readonly string[],
  implants: Implants = {},
  cloneState: CloneState = 'omega'
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
        rateFor(extras, implantByIndex, primary, secondary, cloneState)
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

export interface BoosterContext {
  boosters: readonly Booster[];
  startDate: Date;
}

function withBonus(implants: Implants, bonus: Partial<Attributes>): Implants {
  const merged: Implants = { ...implants };
  for (const name of ATTRIBUTE_NAMES) {
    const add = bonus[name] ?? 0;
    if (add) merged[name] = (merged[name] ?? 0) + add;
  }
  return merged;
}

interface BonusSegment {
  bonus: Partial<Attributes>;
  endSeconds: number;
}

interface BoosterWindow {
  bonus: Partial<Attributes>;
  startOffset: number;
  expiryOffset: number;
}

function stackedBonusAt(windows: readonly BoosterWindow[], t: number): Partial<Attributes> {
  const bonus: Partial<Attributes> = {};
  for (const w of windows) {
    if (t < w.startOffset || t >= w.expiryOffset) continue;
    for (const name of ATTRIBUTE_NAMES) {
      const add = w.bonus[name] ?? 0;
      if (add) bonus[name] = (bonus[name] ?? 0) + add;
    }
  }
  return bonus;
}

function bonusSegments(live: readonly Booster[], startMs: number): BonusSegment[] {
  const windows: BoosterWindow[] = live
    .map((b) => ({
      bonus: b.bonus,
      startOffset: b.startsAt ? Math.max(0, (b.startsAt.getTime() - startMs) / 1000) : 0,
      expiryOffset: (b.expiresAt.getTime() - startMs) / 1000,
    }))
    .filter((w) => w.startOffset < w.expiryOffset);

  const breakpoints = [
    ...new Set([...windows.map((w) => w.startOffset), ...windows.map((w) => w.expiryOffset)]),
  ]
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const segments: BonusSegment[] = [];
  let prev = 0;
  for (const t of breakpoints) {
    segments.push({ bonus: stackedBonusAt(windows, prev), endSeconds: t });
    prev = t;
  }
  segments.push({ bonus: stackedBonusAt(windows, prev), endSeconds: Infinity });
  return segments;
}

function maxBoostedSeconds(
  spByPair: SpByPair,
  boostedImplants: Implants,
  cloneState: CloneState
): number {
  let seconds = 0;
  for (const [key, sp] of spByPair) {
    if (sp <= 0) continue;
    const [primary, secondary] = key.split('|') as [AttributeName, AttributeName];
    seconds += timeToTrain(
      sp,
      trainingRate(
        BASE_MIN + (boostedImplants[primary] ?? 0),
        BASE_MIN + (boostedImplants[secondary] ?? 0),
        cloneState
      )
    );
  }
  return seconds;
}

function bestAttributesWalking(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants,
  segments: readonly BonusSegment[],
  cloneState: CloneState
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
  const lastSeg = segments.length - 1;

  let bestSeconds = Infinity;
  let bestExtras: readonly number[] = [];

  for (const extras of allAllocations()) {
    const valueAt = (n: AttributeName, seg: number) =>
      BASE_MIN + extras[ATTRIBUTE_NAMES.indexOf(n)] + implantOf(n) + (segments[seg].bonus[n] ?? 0);

    let elapsed = 0;
    let seg = 0;
    let i = 0;
    for (; i < steps.length && seg < lastSeg; i++) {
      let spLeft = stepSp[i];
      while (spLeft > 0 && seg < lastSeg) {
        const rate = trainingRate(
          valueAt(stepPrimary[i], seg),
          valueAt(stepSecondary[i], seg),
          cloneState
        );
        const needed = timeToTrain(spLeft, rate);
        const room = segments[seg].endSeconds - elapsed;
        if (needed <= room) {
          elapsed += needed;
          spLeft = 0;
        } else {
          elapsed += room;
          spLeft -= (rate / 60) * room;
          seg++;
        }
      }
      if (spLeft > 0) {
        elapsed += timeToTrain(
          spLeft,
          trainingRate(
            valueAt(stepPrimary[i], lastSeg),
            valueAt(stepSecondary[i], lastSeg),
            cloneState
          )
        );
        i++;
        break;
      }
    }

    const tail = suffix[Math.min(i, steps.length)];
    for (let k = 0; k < keyPairs.length && elapsed < bestSeconds; k++) {
      const sp = tail[k];
      if (sp <= 0) continue;
      const [primary, secondary] = keyPairs[k];
      elapsed += timeToTrain(
        sp,
        trainingRate(valueAt(primary, lastSeg), valueAt(secondary, lastSeg), cloneState)
      );
    }

    if (elapsed < bestSeconds) {
      bestSeconds = elapsed;
      bestExtras = extras;
    }
  }
  return { attributes: toAttributes(bestExtras), seconds: bestSeconds };
}

export function bestAttributes(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants = {},
  booster?: BoosterContext,
  cloneState: CloneState = 'omega'
): BestAttributesResult {
  const spByPair = aggregateSpByPair(steps, skills);
  if (!booster || booster.boosters.length === 0) {
    return bestAttributesForPairs(spByPair, implants, cloneState);
  }

  const startMs = booster.startDate.getTime();
  const live = booster.boosters.filter((b) => b.expiresAt.getTime() > startMs);
  if (live.length === 0) return bestAttributesForPairs(spByPair, implants, cloneState);

  const segments = bonusSegments(live, startMs);
  const earliestExpiry = segments[0].endSeconds;

  const boostedImplants = withBonus(implants, segments[0].bonus);
  if (earliestExpiry >= maxBoostedSeconds(spByPair, boostedImplants, cloneState)) {
    return bestAttributesForPairs(spByPair, boostedImplants, cloneState);
  }

  return bestAttributesWalking(steps, skills, implants, segments, cloneState);
}

export function bestAttributesAtBoundaries(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants,
  booster: BoosterContext,
  startStep: number,
  boundaries: readonly number[],
  cloneState: CloneState = 'omega'
): BestAttributesResult[] {
  const startMs = booster.startDate.getTime();
  const live = booster.boosters.filter((b) => b.expiresAt.getTime() > startMs);
  const segments = bonusSegments(live, startMs);
  const lastSeg = segments.length - 1;

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
    const valueAt = (n: AttributeName, seg: number) =>
      BASE_MIN +
      extras[ATTRIBUTE_NAMES.indexOf(n)] +
      (implants[n] ?? 0) +
      (segments[seg].bonus[n] ?? 0);

    let elapsed = 0;
    let seg = 0;
    let b = 0;
    for (let i = 0; i < sp.length; i++) {
      while (b < boundaries.length && boundaries[b] === startStep + i) {
        if (elapsed < bestSeconds[b]) {
          bestSeconds[b] = elapsed;
          bestExtras[b] = extras;
        }
        b++;
      }
      let spLeft = sp[i];
      while (spLeft > 0) {
        const rate = trainingRate(valueAt(primary[i], seg), valueAt(secondary[i], seg), cloneState);
        const needed = timeToTrain(spLeft, rate);
        const room = seg < lastSeg ? segments[seg].endSeconds - elapsed : Infinity;
        if (needed <= room) {
          elapsed += needed;
          spLeft = 0;
        } else {
          elapsed += room;
          spLeft -= (rate / 60) * room;
          seg++;
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
