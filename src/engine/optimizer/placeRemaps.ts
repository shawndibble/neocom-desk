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
 * Booster-aware when `options.booster` is supplied — both placement paths, so
 * the answer cannot change with `remapCount` (a 0..5 user input). A segment's
 * cost then depends on when it starts, which is why costs are resolved lazily
 * against `dp[k-1][i]` rather than aggregated: sp-per-pair stops being a
 * sufficient key once the start matters. The DP stays valid
 * because segment cost is monotonically non-decreasing in start time — a later
 * start can only mean less Booster — so a minimal prefix is still the best
 * prefix to extend.
 *
 * DP over pair-runs (maximal step runs sharing one attribute pair): segment
 * boundaries inside a run are dominated by boundaries at its edges, so only
 * run edges are split candidates.
 *
 * Cost: linear in pair-runs R, ~13 ms at 200 steps. With a Booster,
 * `remapCount >= 2` still costs ~0.4-0.9 s and cannot be made to cost less by
 * restructuring: a mid-segment expiry defeats aggregation outright. Identity
 * and measurements are in plan §5.6.
 *
 * `remapCount = 1` keeps its own O(R) suffix scan: with one allocation only
 * the last DP column is reachable, so scanning run edges right-to-left gives
 * the same answer directly. See `remapCount === 1` below.
 */
import {
  allocationCostTable,
  bestAttributes,
  bestAttributesAtBoundaries,
  bestAttributesForPairs,
  pairKey,
  type BestAttributesResult,
  type BoosterContext,
} from '@/engine/optimizer/bestAttributes';
import { computeSchedule } from '@/engine/schedule';
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
  /**
   * Live Boosters and when the plan starts training. Omit for Booster-blind
   * costing — every existing caller and test does, and that path is untouched.
   */
  booster?: BoosterContext;
}

/**
 * Remaps the planner offers today. 1 for product reasons, not speed: the UI
 * has to say what a multi-remap answer means, and plan §5 decision 3 (the
 * savings badge above one remap) is unanswered. `placeRemaps` accepts any
 * count.
 */
export const MAX_SUPPORTED_REMAPS = 1;

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
  const { remapCount, currentAttributes, implants = {}, booster } = options;

  const liveBoosters =
    booster?.boosters.filter((b) => b.expiresAt.getTime() > booster.startDate.getTime()) ?? [];
  const boosted = booster !== undefined && liveBoosters.length > 0;
  /**
   * Seconds until the LAST Booster lapses; -Infinity when none. Earliest is
   * the tempting wrong choice: it stops the cutoff at the first lapse with a
   * longer Booster still running, letting a throwaway Booster worsen the
   * answer.
   */
  const expirySeconds = boosted
    ? Math.max(
        ...liveBoosters.map((b) => (b.expiresAt.getTime() - booster!.startDate.getTime()) / 1000)
      )
    : -Infinity;

  // Baseline on current attributes. With a Booster live this defers to
  // `computeSchedule`, so the no-remap number here is the same one the planner
  // shows rather than a second opinion about it.
  const boostedStepSeconds =
    boosted && steps.length > 0
      ? computeSchedule(
          steps,
          {
            attributes: currentAttributes,
            implants,
            boosters: [...liveBoosters],
            startDate: booster!.startDate,
          },
          skills
        ).map((s) => s.seconds)
      : null;

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
    const seconds = boostedStepSeconds ? boostedStepSeconds[index] : timeToTrain(sp, rate);
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

  /**
   * Segment cost for runs [i, j) starting `startSeconds` into the plan.
   *
   * Falls straight through to the Booster-blind `fallback` whenever no Booster
   * is live or the segment begins after the last one lapsed — which is the
   * overwhelming majority: a 24-day Booster covers the first ~3% of a
   * multi-year plan, so only the earliest segments ever pay for the walk.
   * Memoized on the segment plus its start, since with a Booster the start is
   * part of the cost and the sp-per-pair signature alone is no longer a key.
   */
  const boostedCost = new Map<string, BestAttributesResult>();
  const segmentCostAt = (
    i: number,
    j: number,
    startSeconds: number,
    fallback: BestAttributesResult
  ): BestAttributesResult => {
    if (!boosted || startSeconds >= expirySeconds) return fallback;
    const key = `${i}|${j}|${startSeconds}`;
    let result = boostedCost.get(key);
    if (!result) {
      result = bestAttributes(
        steps.slice(runs[i].startStep, runs[j - 1].endStep + 1),
        skills,
        implants,
        {
          boosters: liveBoosters,
          startDate: new Date(booster!.startDate.getTime() + startSeconds * 1000),
        }
      );
      boostedCost.set(key, result);
    }
    return result;
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
      const best = segmentCostAt(
        i,
        runCount,
        currentPrefix[i],
        bestAttributesForPairs(spByPair, implants)
      );
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

  // ---- General DP: up to `maxSegments` allocations ------------------------
  //
  // The choice of allocation is pulled OUTSIDE the search over boundaries.
  // Blind segment cost is linear in SP, so for a fixed allocation `a` it is a
  // difference of prefix sums, F(a, j) - F(a, i), and
  //
  //   min over i of ( dp[k-1][i] + cost(i, j) )
  //     = min over a of ( F(a, j) + min over i of ( dp[k-1][i] - F(a, i) ) )
  //
  // where the inner minimum is a running scan: O(allocations * R) per remap.
  //
  // The prefix subtraction reassociates the float sum, so these costs are
  // used to CHOOSE boundaries, never to report a duration: each chosen
  // segment is re-priced exactly by `exactSegment` below.
  const pairKeys = [...new Set(runs.map((run) => run.pair))];
  const pairIndex = new Map(pairKeys.map((key, index) => [key, index]));
  const runPair = runs.map((run) => pairIndex.get(run.pair)!);
  /** Exclusive end step of every run — the boosted pass always wants a suffix of this. */
  const runEnds = runs.map((run) => run.endStep + 1);
  const table = allocationCostTable(pairKeys, implants);
  const { secondsPerSp, width } = table;

  /**
   * Exact cost of runs [i, j) on its own best allocation — the number the user
   * is shown. Pairs go in in ascending run order; changing that shifts the
   * float sum, and blind totals are pinned to the last printed digit.
   */
  const exactSegment = (i: number, j: number): BestAttributesResult => {
    const spByPair = new Map<string, number>();
    for (let r = i; r < j; r++) {
      spByPair.set(runs[r].pair, (spByPair.get(runs[r].pair) ?? 0) + runs[r].sp);
    }
    return bestAttributesForPairs(spByPair, implants);
  };

  // dp[k][j]: min seconds for runs [0, j) using exactly k allocations after
  // an optional (possibly empty) leading current-attributes prefix. Row 0 IS
  // that prefix: dp[0][j] spends no remap and trains [0, j) on the current
  // attributes, so dp[0][runCount] equals the no-remap baseline.
  const dp: number[][] = [];
  const parent: number[][] = [];
  // The Booster-aware segment chosen for dp[k][j], when one won. Its cost
  // depends on where it started, so it cannot be rebuilt from (i, j) alone.
  const chosen: (BestAttributesResult | null)[][] = [];
  for (let k = 0; k <= maxSegments; k++) {
    dp[k] = new Array<number>(runCount + 1).fill(Infinity);
    parent[k] = new Array<number>(runCount + 1).fill(-1);
    chosen[k] = new Array<BestAttributesResult | null>(runCount + 1).fill(null);
  }
  for (let j = 0; j <= runCount; j++) dp[0][j] = currentPrefix[j];

  for (let k = 1; k <= maxSegments; k++) {
    const previous = dp[k - 1];
    const current = dp[k];
    const parents = parent[k];
    for (let a = 0; a < table.count; a++) {
      const base = a * width;
      // `prefixSeconds` is F(a, x): runs [0, x) trained on allocation `a`.
      let prefixSeconds = 0;
      let bestPrefix = Infinity;
      let bestPrefixIndex = -1;
      for (let x = 0; x <= runCount; x++) {
        // Close a segment at j = x before opening one at i = x, so a segment
        // is never empty.
        if (x >= k && bestPrefixIndex >= 0) {
          const total = bestPrefix + prefixSeconds;
          // Strict `<`, then the lower split index on a tie: the EARLIEST
          // split wins.
          if (total < current[x] || (total === current[x] && bestPrefixIndex < parents[x])) {
            current[x] = total;
            parents[x] = bestPrefixIndex;
          }
        }
        if (x >= k - 1 && previous[x] !== Infinity) {
          const candidate = previous[x] - prefixSeconds;
          if (candidate < bestPrefix) {
            bestPrefix = candidate;
            bestPrefixIndex = x;
          }
        }
        if (x < runCount) prefixSeconds += runs[x].sp * secondsPerSp[base + runPair[x]];
      }
    }

    // Boosted segments are a SEPARATE candidate, not a replacement: a Booster
    // only ever raises attributes, so its cost is never above the blind cost
    // for the same segment, and taking the lower of the two is the true
    // minimum. Only segments starting before the last Booster lapses qualify,
    // which on any real plan is a handful. Every end point sharing a start is
    // costed in one pass; doing it per (i, j) instead cost 21.7 s.
    if (boosted) {
      for (let i = k - 1; i < runCount; i++) {
        const start = previous[i];
        if (start === Infinity || start >= expirySeconds) continue;
        const batch = bestAttributesAtBoundaries(
          steps,
          skills,
          implants,
          {
            boosters: liveBoosters,
            startDate: new Date(booster!.startDate.getTime() + start * 1000),
          },
          runs[i].startStep,
          runEnds.slice(i)
        );
        for (let j = Math.max(k, i + 1); j <= runCount; j++) {
          const seg = batch[j - i - 1];
          const total = start + seg.seconds;
          if (total < current[j]) {
            current[j] = total;
            parents[j] = i;
            chosen[k][j] = seg;
          }
        }
      }
    }
  }

  // Fewest segments achieving the minimum (extra remaps stay unused).
  let bestSeconds = Infinity;
  for (let k = 1; k <= maxSegments; k++) bestSeconds = Math.min(bestSeconds, dp[k][runCount]);
  // A NaN anywhere makes every comparison below false, which would leave
  // `bestK` pointing at a row with no parent and reconstruct from runs[-1].
  if (!Number.isFinite(bestSeconds)) return noRemapResult();
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
    const { attributes, seconds } = chosen[k][j] ?? exactSegment(i, j);
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
