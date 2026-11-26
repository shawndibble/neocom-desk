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
import { spBetween, timeToTrain, trainingRate } from '@/engine/skills/sp';
import type { Attributes, CloneState, EngineSkill, Implants, PlanStep } from '@/engine/types';

export interface RemapSegment {
  startIndex: number;
  endIndex: number;
  attributes: Attributes;
  seconds: number;
  remap: boolean;
}

export interface PlaceRemapsResult {
  segments: RemapSegment[];
  totalSeconds: number;
  currentSeconds: number;
  savingsSeconds: number;
}

export interface PlaceRemapsOptions {
  remapCount: number;
  currentAttributes: Attributes;
  implants?: Implants;
  booster?: BoosterContext;
  cloneState?: CloneState;
  timedRemap?: { notBeforeSeconds: number };
}

export const MAX_SUPPORTED_REMAPS = 2;

const TIE_EPSILON = 1e-6;

function tieBound(bestSeconds: number): number {
  return bestSeconds + Math.max(TIE_EPSILON, bestSeconds * 1e-9);
}

interface Run {
  startStep: number;
  endStep: number;
  pair: string;
  sp: number;
  currentSeconds: number;
}

export function placeRemaps(
  steps: readonly PlanStep[],
  skills: ReadonlyMap<number, EngineSkill>,
  options: PlaceRemapsOptions
): PlaceRemapsResult {
  const { remapCount, currentAttributes, implants = {}, booster, cloneState, timedRemap } = options;

  const liveBoosters =
    booster?.boosters.filter((b) => b.expiresAt.getTime() > booster.startDate.getTime()) ?? [];
  const boosted = booster !== undefined && liveBoosters.length > 0;
  const expirySeconds = boosted
    ? Math.max(
        ...liveBoosters.map((b) => (b.expiresAt.getTime() - booster!.startDate.getTime()) / 1000)
      )
    : -Infinity;

  const boostedStepSeconds =
    boosted && steps.length > 0
      ? computeSchedule(
          steps,
          {
            attributes: currentAttributes,
            implants,
            boosters: [...liveBoosters],
            startDate: booster!.startDate,
            cloneState,
          },
          skills
        ).map((s) => s.seconds)
      : null;

  let currentSeconds = 0;
  const runs: Run[] = [];
  steps.forEach((step, index) => {
    const skill = skills.get(step.skillTypeID);
    if (!skill) throw new Error(`Unknown skill typeID ${step.skillTypeID}`);
    const sp = spBetween(skill.rank, step.level - 1, step.level);
    const rate = trainingRate(
      currentAttributes[skill.primary] + (implants[skill.primary] ?? 0),
      currentAttributes[skill.secondary] + (implants[skill.secondary] ?? 0),
      cloneState
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

  const currentPrefix = new Array<number>(runCount + 1).fill(0);
  for (let j = 1; j <= runCount; j++) {
    currentPrefix[j] = currentPrefix[j - 1] + runs[j - 1].currentSeconds;
  }

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
        },
        cloneState
      );
      boostedCost.set(key, result);
    }
    return result;
  };

  if (remapCount === 1) {
    const suffixSp = new Map<string, number>();
    let pairOrder: string[] = [];
    let bestSeconds = Infinity;
    let bestIndex = -1;
    let bestSegmentAttributes: Attributes | null = null;
    let bestSegmentSeconds = 0;
    for (let i = runCount - 1; i >= 0; i--) {
      const run = runs[i];
      suffixSp.set(run.pair, (suffixSp.get(run.pair) ?? 0) + run.sp);
      pairOrder = [run.pair, ...pairOrder.filter((pair) => pair !== run.pair)];
      if (timedRemap && currentPrefix[i] < timedRemap.notBeforeSeconds) continue;
      const spByPair = new Map<string, number>();
      for (const pair of pairOrder) spByPair.set(pair, suffixSp.get(pair)!);
      const best = segmentCostAt(
        i,
        runCount,
        currentPrefix[i],
        bestAttributesForPairs(spByPair, implants, cloneState)
      );
      const segmentSeconds = best.seconds;
      const total = currentPrefix[i] + segmentSeconds;
      if (total <= bestSeconds) {
        bestSeconds = total;
        bestIndex = i;
        bestSegmentAttributes = best.attributes;
        bestSegmentSeconds = segmentSeconds;
      }
    }
    if (currentSeconds <= tieBound(bestSeconds)) return noRemapResult();

    const segments: RemapSegment[] = [
      {
        startIndex: runs[bestIndex].startStep,
        endIndex: runs[runCount - 1].endStep,
        attributes: bestSegmentAttributes as Attributes,
        seconds: bestSegmentSeconds,
        remap: true,
      },
    ];
    return resultWithLeadingPrefix(segments, bestSegmentSeconds, bestIndex);
  }

  const pairKeys = [...new Set(runs.map((run) => run.pair))];
  const pairIndex = new Map(pairKeys.map((key, index) => [key, index]));
  const runPair = runs.map((run) => pairIndex.get(run.pair)!);
  const runEnds = runs.map((run) => run.endStep + 1);
  const table = allocationCostTable(pairKeys, implants, cloneState);
  const { secondsPerSp, width } = table;

  const exactSegment = (i: number, j: number): BestAttributesResult => {
    const spByPair = new Map<string, number>();
    for (let r = i; r < j; r++) {
      spByPair.set(runs[r].pair, (spByPair.get(runs[r].pair) ?? 0) + runs[r].sp);
    }
    return bestAttributesForPairs(spByPair, implants, cloneState);
  };

  const dp: number[][] = [];
  const parent: number[][] = [];
  const chosen: (BestAttributesResult | null)[][] = [];
  for (let k = 0; k <= maxSegments; k++) {
    dp[k] = new Array<number>(runCount + 1).fill(Infinity);
    parent[k] = new Array<number>(runCount + 1).fill(-1);
    chosen[k] = new Array<BestAttributesResult | null>(runCount + 1).fill(null);
  }
  for (let j = 0; j <= runCount; j++) dp[0][j] = currentPrefix[j];

  const timedFloorRow = timedRemap && remapCount <= runCount ? maxSegments : -1;
  const violatesTimedFloor = (elapsedSeconds: number): boolean =>
    timedRemap !== undefined && elapsedSeconds < timedRemap.notBeforeSeconds;

  for (let k = 1; k <= maxSegments; k++) {
    const previousRow = dp[k - 1];
    const current = dp[k];
    const parents = parent[k];
    for (let a = 0; a < table.count; a++) {
      const base = a * width;
      let prefixSeconds = 0;
      let bestPrefix = Infinity;
      let bestPrefixIndex = -1;
      for (let x = 0; x <= runCount; x++) {
        if (x >= k && bestPrefixIndex >= 0) {
          const total = bestPrefix + prefixSeconds;
          if (total < current[x] || (total === current[x] && bestPrefixIndex < parents[x])) {
            current[x] = total;
            parents[x] = bestPrefixIndex;
          }
        }
        const eligible = k !== timedFloorRow || !violatesTimedFloor(previousRow[x]);
        if (x >= k - 1 && previousRow[x] !== Infinity && eligible) {
          const candidate = previousRow[x] - prefixSeconds;
          if (candidate < bestPrefix) {
            bestPrefix = candidate;
            bestPrefixIndex = x;
          }
        }
        if (x < runCount) prefixSeconds += runs[x].sp * secondsPerSp[base + runPair[x]];
      }
    }

    if (boosted) {
      for (let i = k - 1; i < runCount; i++) {
        const start = previousRow[i];
        if (start === Infinity || start >= expirySeconds) continue;
        if (k === timedFloorRow && violatesTimedFloor(start)) continue;
        const batch = bestAttributesAtBoundaries(
          steps,
          skills,
          implants,
          {
            boosters: liveBoosters,
            startDate: new Date(booster!.startDate.getTime() + start * 1000),
          },
          runs[i].startStep,
          runEnds.slice(i),
          cloneState
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

  let bestSeconds = Infinity;
  for (let k = 1; k <= maxSegments; k++) bestSeconds = Math.min(bestSeconds, dp[k][runCount]);
  if (!Number.isFinite(bestSeconds)) return noRemapResult();
  let bestK = maxSegments;
  const bound = tieBound(bestSeconds);

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
