/**
 * Optimal remap placement: split an ordered plan into at most `remapCount`
 * contiguous segments, one attribute allocation each, minimizing total time.
 *
 * Model: N remaps = up to N allocations, optionally preceded by a leading
 * segment trained on the CURRENT attributes at no remap cost. N=0 trains the
 * whole plan on the current attributes; N=1 answers "where do I remap": train
 * a prefix on current attributes, then remap once at the optimizer-chosen
 * boundary (possibly step 0). Remaps are optional: when no reachable
 * allocation beats the current attributes (they may sit outside the 17..27
 * base space, e.g. when fed from ESI values that already include implant or
 * booster bonuses), the result keeps the current attributes and reports zero
 * savings — the output is never slower than not remapping at all.
 *
 * DP over pair-runs (maximal step runs sharing one attribute pair): segment
 * boundaries inside a run are dominated by boundaries at its edges, so only
 * run edges are split candidates. Segment cost is memoized on the aggregated
 * sp-per-pair signature (at most 20 pairs), keeping ~200-step plans fast.
 */
import {
  bestAttributesForPairs,
  pairKey,
  type BestAttributesResult,
} from '@/engine/optimizer/bestAttributes';
import { spBetween, timeToTrain, trainingRate } from '@/engine/sp';
import type { Attributes, EngineSkill, Implants, PlanStep } from '@/engine/types';

export interface RemapSegment {
  /** First step of the segment (inclusive). */
  startIndex: number;
  /** Last step of the segment (inclusive). */
  endIndex: number;
  attributes: Attributes;
  seconds: number;
  /** True when this segment starts with a remap; false for the leading current-attributes segment. */
  remap: boolean;
}

export interface PlaceRemapsResult {
  segments: RemapSegment[];
  totalSeconds: number;
  /** Whole plan trained on the current attributes (no remap). */
  currentSeconds: number;
  savingsSeconds: number;
}

export interface PlaceRemapsOptions {
  /** Remaps the user is willing to spend (allocations available). */
  remapCount: number;
  currentAttributes: Attributes;
  implants?: Implants;
}

const TIE_EPSILON = 1e-6;

interface Run {
  startStep: number;
  endStep: number; // inclusive
  pair: string;
  sp: number;
  /** Seconds to train this run on the current attributes. */
  currentSeconds: number;
}

export function placeRemaps(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: PlaceRemapsOptions
): PlaceRemapsResult {
  const { remapCount, currentAttributes, implants = {} } = options;

  // Per-step sp + pair, plus baseline time on current attributes.
  let currentSeconds = 0;
  const runs: Run[] = [];
  steps.forEach((step, index) => {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const sp = spBetween(skill.rank, step.level - 1, step.level);
    const rate = trainingRate(
      currentAttributes[skill.primary] + (implants[skill.primary] ?? 0),
      currentAttributes[skill.secondary] + (implants[skill.secondary] ?? 0)
    );
    const seconds = timeToTrain(sp, rate);
    currentSeconds += seconds;
    const pair = pairKey(skill.primary, skill.secondary);
    const last = runs[runs.length - 1];
    if (last && last.pair === pair) {
      last.endStep = index;
      last.sp += sp;
      last.currentSeconds += seconds;
    } else {
      runs.push({ startStep: index, endStep: index, pair, sp, currentSeconds: seconds });
    }
  });

  if (steps.length === 0) {
    return { segments: [], totalSeconds: 0, currentSeconds: 0, savingsSeconds: 0 };
  }

  const noRemapResult = (): PlaceRemapsResult => ({
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
  });

  if (remapCount <= 0) return noRemapResult();

  const runCount = runs.length;
  const maxSegments = Math.min(remapCount, runCount);

  // Segment cost over runs [i, j), memoized on the sp-per-pair signature.
  const bySignature = new Map<string, BestAttributesResult>();
  const segment: BestAttributesResult[][] = [];
  for (let i = 0; i < runCount; i++) {
    segment[i] = [];
    const spByPair = new Map<string, number>();
    for (let j = i + 1; j <= runCount; j++) {
      const run = runs[j - 1];
      spByPair.set(run.pair, (spByPair.get(run.pair) ?? 0) + run.sp);
      const signature = [...spByPair.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([pair, sp]) => `${pair}=${sp}`)
        .join(';');
      let result = bySignature.get(signature);
      if (!result) {
        result = bestAttributesForPairs(spByPair, implants);
        bySignature.set(signature, result);
      }
      segment[i][j] = result;
    }
  }

  // Prefix cost: runs [0, j) trained on the current attributes (no remap).
  const currentPrefix = new Array<number>(runCount + 1).fill(0);
  for (let j = 1; j <= runCount; j++) {
    currentPrefix[j] = currentPrefix[j - 1] + runs[j - 1].currentSeconds;
  }

  // dp[k][j]: min seconds for runs [0, j) using exactly k allocations after
  // an optional (possibly empty) leading current-attributes prefix. Row 0 IS
  // that prefix: dp[0][j] spends no remap and trains [0, j) on the current
  // attributes, so dp[0][runCount] equals the no-remap baseline.
  const dp: number[][] = [];
  const parent: number[][] = [];
  for (let k = 0; k <= maxSegments; k++) {
    dp[k] = new Array<number>(runCount + 1).fill(Infinity);
    parent[k] = new Array<number>(runCount + 1).fill(-1);
  }
  for (let j = 0; j <= runCount; j++) dp[0][j] = currentPrefix[j];
  for (let k = 1; k <= maxSegments; k++) {
    for (let j = k; j <= runCount; j++) {
      for (let i = k - 1; i < j; i++) {
        if (dp[k - 1][i] === Infinity) continue;
        const total = dp[k - 1][i] + segment[i][j].seconds;
        if (total < dp[k][j]) {
          dp[k][j] = total;
          parent[k][j] = i;
        }
      }
    }
  }

  // Fewest segments achieving the minimum (extra remaps stay unused).
  let bestSeconds = Infinity;
  for (let k = 1; k <= maxSegments; k++) bestSeconds = Math.min(bestSeconds, dp[k][runCount]);
  let bestK = maxSegments;
  const tieBound = bestSeconds + Math.max(TIE_EPSILON, bestSeconds * 1e-9);

  // Not remapping at all is always a candidate: if the current attributes are
  // at least as fast as the best reachable allocation (possible when they lie
  // outside the remap search space), keep them and spend no remap.
  if (currentSeconds <= tieBound) return noRemapResult();

  for (let k = 1; k <= maxSegments; k++) {
    if (dp[k][runCount] <= tieBound) {
      bestK = k;
      break;
    }
  }

  const segments: RemapSegment[] = [];
  let totalSeconds = 0;
  let j = runCount;
  for (let k = bestK; k >= 1; k--) {
    const i = parent[k][j];
    const { attributes, seconds } = segment[i][j];
    segments.unshift({
      startIndex: runs[i].startStep,
      endIndex: runs[j - 1].endStep,
      attributes,
      seconds,
      remap: true,
    });
    totalSeconds += seconds;
    j = i;
  }
  // Leading current-attributes prefix (row 0 of the DP), if any runs remain.
  if (j > 0) {
    segments.unshift({
      startIndex: 0,
      endIndex: runs[j - 1].endStep,
      attributes: { ...currentAttributes },
      seconds: currentPrefix[j],
      remap: false,
    });
    totalSeconds += currentPrefix[j];
  }

  return {
    segments,
    totalSeconds,
    currentSeconds,
    savingsSeconds: currentSeconds - totalSeconds,
  };
}
