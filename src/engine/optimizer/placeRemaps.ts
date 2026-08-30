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
 * against `dp[k-1][i]` rather than read from the signature-memoized table: the
 * sp-per-pair signature stops being a sufficient key. The DP stays valid
 * because segment cost is monotonically non-decreasing in start time — a later
 * start can only mean less Booster — so a minimal prefix is still the best
 * prefix to extend.
 *
 * MEASURED COST at 200 steps with a 24-day Booster: `remapCount = 1` goes
 * 64 ms -> 89 ms, `remapCount = 2` 2.16 s -> 2.64 s, `remapCount = 5` 2.15 s
 * -> 3.35 s. Costing each (i, j) separately made that last figure 21.7 s;
 * batching every j that shares a start into one pass is what removed it.
 *
 * Note what the blind column says: ~2.1 s at every `remapCount >= 2`,
 * Booster or not. That is the O(R^2) segment-cost precompute below (D5), and
 * capping `remapCount` does not avoid it — only `remapCount = 1`, which skips
 * the DP entirely, does. Hence `MAX_SUPPORTED_REMAPS`.
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
 * Remaps the planner offers today. 1, because that is the path taking the O(R)
 * suffix scan; 2 already enters the O(R^2) DP and ~2.1 s on a 200-step plan
 * before a Booster is involved. Raising it is a product call gated on D5, not
 * a constant to bump — `placeRemaps` itself accepts any count.
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
  /** Seconds from plan start until the first Booster lapses; -Infinity when none. */
  const expirySeconds = boosted
    ? Math.min(
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
  // The segment actually chosen for dp[k][j]. With a Booster its cost depends
  // on where it started, so `segment[i][j]` is no longer enough to rebuild it.
  const chosen: (BestAttributesResult | null)[][] = [];
  for (let k = 0; k <= maxSegments; k++) {
    dp[k] = new Array<number>(runCount + 1).fill(Infinity);
    parent[k] = new Array<number>(runCount + 1).fill(-1);
    chosen[k] = new Array<BestAttributesResult | null>(runCount + 1).fill(null);
  }
  for (let j = 0; j <= runCount; j++) dp[0][j] = currentPrefix[j];
  for (let k = 1; k <= maxSegments; k++) {
    // Every segment starting at run i shares one start offset (dp[k-1][i]) and
    // therefore one boosted prefix, so all its end points are costed in a
    // single pass. Doing it per (i, j) instead is what made this path 21.7 s.
    const batched = new Map<number, BestAttributesResult[]>();
    if (boosted) {
      for (let i = k - 1; i < runCount; i++) {
        const start = dp[k - 1][i];
        if (start === Infinity || start >= expirySeconds) continue;
        const boundaries: number[] = [];
        for (let j = i + 1; j <= runCount; j++) boundaries.push(runs[j - 1].endStep + 1);
        batched.set(
          i,
          bestAttributesAtBoundaries(
            steps,
            skills,
            implants,
            {
              boosters: liveBoosters,
              startDate: new Date(booster!.startDate.getTime() + start * 1000),
            },
            runs[i].startStep,
            boundaries
          )
        );
      }
    }

    for (let j = k; j <= runCount; j++) {
      for (let i = k - 1; i < j; i++) {
        if (dp[k - 1][i] === Infinity) continue;
        const batch = batched.get(i);
        const seg = batch ? batch[j - i - 1] : segment[i][j];
        const total = dp[k - 1][i] + seg.seconds;
        // Strict `<` on an ascending scan: on a tie the EARLIEST split wins.
        if (total < dp[k][j]) {
          dp[k][j] = total;
          parent[k][j] = i;
          chosen[k][j] = seg;
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
    const { attributes, seconds } = chosen[k][j] ?? segment[i][j];
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
