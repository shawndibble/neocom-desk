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
 * Booster-blind, and knowingly so: `bestAttributes` accepts a `BoosterContext`
 * but this passes none, so segment costs use base + implant rates only. Fixing
 * it needs each segment's wall-clock start offset, which also stops the
 * sp-per-pair signature below from being a sufficient memo key — a segment's
 * cost would then depend on when it starts. Both placement paths must change
 * together: `remapCount` is a 0..5 user input, so a Booster-aware single-remap
 * path beside a blind DP would change the answer with the count (plan §5.5).
 *
 * DP over pair-runs (maximal step runs sharing one attribute pair): segment
 * boundaries inside a run are dominated by boundaries at its edges, so only
 * run edges are split candidates. Segment cost is memoized on the aggregated
 * sp-per-pair signature (at most 20 pairs).
 *
 * Cost: the general DP fills an R x R segment grid, each cell a 2,885-way
 * allocation brute force, so it is quadratic in pair runs R and NOT fast on
 * long plans (measured ~3.8 s at R = 145, ~10 s at R = 236). N = 1 — the case
 * CONTEXT.md calls out and the UI default — takes an O(R) suffix scan instead:
 * with one allocation only the last DP column is reachable, so scanning run
 * edges right-to-left gives the exact same answer in R segment costs
 * (~50-90 ms at R = 200). See `remapCount === 1` below.
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

/**
 * Upper bound for "as good as the best": absolute epsilon, widened by a
 * relative term so long plans (totals in the millions of seconds) are not
 * decided by float noise. Shared by both placement paths so tuning the
 * tolerance cannot make them disagree on whether a remap is worth taking.
 */
function tieBound(bestSeconds: number): number {
  return bestSeconds + Math.max(TIE_EPSILON, bestSeconds * 1e-9);
}

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

  // Prefix cost: runs [0, j) trained on the current attributes (no remap).
  const currentPrefix = new Array<number>(runCount + 1).fill(0);
  for (let j = 1; j <= runCount; j++) {
    currentPrefix[j] = currentPrefix[j - 1] + runs[j - 1].currentSeconds;
  }

  /**
   * Build the result envelope around already-costed remapped segments,
   * prepending the leading current-attributes segment (row 0 of the DP) when
   * runs [0, splitRunIndex) precede the first remap. Shared by both paths;
   * `remappedSeconds` is the caller's running total so the prefix is still the
   * last term added, keeping float addition order identical in each.
   */
  const resultWithLeadingPrefix = (
    segments: RemapSegment[],
    remappedSeconds: number,
    splitRunIndex: number
  ): PlaceRemapsResult => {
    let totalSeconds = remappedSeconds;
    if (splitRunIndex > 0) {
      segments.unshift({
        startIndex: 0,
        endIndex: runs[splitRunIndex - 1].endStep,
        attributes: { ...currentAttributes },
        seconds: currentPrefix[splitRunIndex],
        remap: false,
      });
      totalSeconds += currentPrefix[splitRunIndex];
    }
    return {
      segments,
      totalSeconds,
      currentSeconds,
      savingsSeconds: currentSeconds - totalSeconds,
    };
  };

  // ---- Fast path: exactly one allocation ("where do I remap?") ------------
  // With one remap the DP collapses to its last column: the total is
  // currentPrefix[i] + cost(runs [i, runCount)) for some run edge i, so only
  // the R suffix segments are ever needed, never the R x R grid. Suffixes are
  // built right-to-left, but each sp-per-pair map is emitted in
  // first-appearance-scanning-forward order so the resulting cost is
  // bit-identical to the grid's.
  //
  // Tie-break: the EARLIEST run edge wins. Scanning i downwards with `<=`
  // keeps the lowest tied i, exactly as the DP's ascending scan with a strict
  // `<` does — the mirrored scan direction is the only part of the tie-break
  // still duplicated; the tolerance itself is `tieBound`, shared with the DP,
  // as is the prefix/result construction in `resultWithLeadingPrefix`.
  if (remapCount === 1) {
    const suffixSp = new Map<string, number>();
    let pairOrder: string[] = [];
    let bestSeconds = Infinity;
    let bestIndex = -1;
    let bestSegment: BestAttributesResult | null = null;
    for (let i = runCount - 1; i >= 0; i--) {
      const run = runs[i];
      suffixSp.set(run.pair, (suffixSp.get(run.pair) ?? 0) + run.sp);
      pairOrder = [run.pair, ...pairOrder.filter((pair) => pair !== run.pair)];
      const spByPair = new Map<string, number>();
      for (const pair of pairOrder) spByPair.set(pair, suffixSp.get(pair)!);
      const best = bestAttributesForPairs(spByPair, implants);
      const total = currentPrefix[i] + best.seconds;
      if (total <= bestSeconds) {
        bestSeconds = total;
        bestIndex = i;
        bestSegment = best;
      }
    }
    // Not remapping at all is always a candidate (see the DP path below).
    if (currentSeconds <= tieBound(bestSeconds)) return noRemapResult();

    const best = bestSegment as BestAttributesResult;
    const segments: RemapSegment[] = [
      {
        startIndex: runs[bestIndex].startStep,
        endIndex: runs[runCount - 1].endStep,
        attributes: best.attributes,
        seconds: best.seconds,
        remap: true,
      },
    ];
    return resultWithLeadingPrefix(segments, best.seconds, bestIndex);
  }

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
        // Strict `<` on an ascending scan: on a tie the EARLIEST split wins.
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
  const bound = tieBound(bestSeconds);

  // Not remapping at all is always a candidate: if the current attributes are
  // at least as fast as the best reachable allocation (possible when they lie
  // outside the remap search space), keep them and spend no remap.
  if (currentSeconds <= bound) return noRemapResult();

  for (let k = 1; k <= maxSegments; k++) {
    if (dp[k][runCount] <= bound) {
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
  return resultWithLeadingPrefix(segments, totalSeconds, j);
}
