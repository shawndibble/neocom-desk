/**
 * Optimal attribute allocation for a contiguous plan segment.
 *
 * EVE remap rules (EVE University wiki, "Skills and learning" / Neural Remap):
 * 99 base points across 5 attributes, min 17 / max 27 each, i.e. 14 freely
 * allocatable points. Implants add on top and are unaffected by a remap.
 * Boosters are ignored here today; `computeSchedule` applies them, so the two
 * disagree. That is a known wrong answer, not a safe simplification — long
 * accelerators run to weeks, so a blind optimum is wrong for weeks of
 * training. Ruled to be fixed (plan §5.5, option b); do not build on the
 * exclusion.
 */
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import type { AttributeName, Attributes, EngineSkill, Implants, PlanStep } from '@/engine/types';

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

/** Brute-force the best allocation for pre-aggregated segment SP. */
export function bestAttributesForPairs(
  spByPair: SpByPair,
  implants: Implants = {}
): BestAttributesResult {
  const pairs: { primary: number; secondary: number; sp: number }[] = [];
  for (const [key, sp] of spByPair) {
    if (sp <= 0) continue;
    const [primary, secondary] = key.split('|') as [AttributeName, AttributeName];
    pairs.push({
      primary: ATTRIBUTE_NAMES.indexOf(primary),
      secondary: ATTRIBUTE_NAMES.indexOf(secondary),
      sp,
    });
  }
  if (pairs.length === 0) return { attributes: { ...DEFAULT_ATTRIBUTES }, seconds: 0 };

  const implantByIndex = ATTRIBUTE_NAMES.map((name) => implants[name] ?? 0);
  let bestSeconds = Infinity;
  let bestExtras: readonly number[] = [];
  for (const extras of allAllocations()) {
    let seconds = 0;
    for (const { primary, secondary, sp } of pairs) {
      const rate = trainingRate(
        BASE_MIN + extras[primary] + implantByIndex[primary],
        BASE_MIN + extras[secondary] + implantByIndex[secondary]
      );
      seconds += timeToTrain(sp, rate);
    }
    if (seconds < bestSeconds) {
      bestSeconds = seconds;
      bestExtras = extras;
    }
  }
  return { attributes: toAttributes(bestExtras), seconds: bestSeconds };
}

/**
 * Best remap allocation for a contiguous segment of plan steps: minimizes
 * total training seconds at base+implant rates.
 */
export function bestAttributes(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  implants: Implants = {}
): BestAttributesResult {
  return bestAttributesForPairs(aggregateSpByPair(steps, skills), implants);
}
