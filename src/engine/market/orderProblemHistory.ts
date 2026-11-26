import { DAY_MS } from '@/lib/age';
import { UNDERCUT_PROBLEMS, type OrderProblem } from './orderProblems';

export interface OrderProblemSample {
  at: number;
  problem: OrderProblem;
}

const UNDERCUT_HISTORY_PROBLEMS: ReadonlySet<OrderProblem> = new Set<OrderProblem>([
  ...UNDERCUT_PROBLEMS,
  'outbid',
]);

export interface UndercutHistoryThresholds {
  windowMs: number;
  minSamples: number;
  undercutRate: number;
  minSpacingMs: number;
}

export const DEFAULT_UNDERCUT_HISTORY_THRESHOLDS: UndercutHistoryThresholds = {
  windowMs: 7 * DAY_MS,
  minSamples: 12,
  undercutRate: 0.5,
  minSpacingMs: 4 * 60 * 1000,
};

export const MAX_SAMPLES_PER_ORDER = 512;

function inWindow(
  samples: readonly OrderProblemSample[],
  nowMs: number,
  windowMs: number
): OrderProblemSample[] {
  const cutoff = nowMs - windowMs;
  return samples.filter((sample) => sample.at >= cutoff);
}

export function sampledProblem(problems: readonly OrderProblem[]): OrderProblem {
  return (
    problems.find((problem) => UNDERCUT_HISTORY_PROBLEMS.has(problem)) ?? problems[0] ?? 'healthy'
  );
}

export function wasFrequentlyUndercut(
  samples: readonly OrderProblemSample[],
  nowMs: number,
  thresholds: UndercutHistoryThresholds = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS
): boolean {
  const recent = inWindow(samples, nowMs, thresholds.windowMs);
  if (recent.length < thresholds.minSamples) return false;
  const undercut = recent.filter((sample) => UNDERCUT_HISTORY_PROBLEMS.has(sample.problem)).length;
  return undercut / recent.length > thresholds.undercutRate;
}

export function appendOrderProblemSample(
  samples: readonly OrderProblemSample[],
  sample: OrderProblemSample,
  thresholds: UndercutHistoryThresholds = DEFAULT_UNDERCUT_HISTORY_THRESHOLDS
): readonly OrderProblemSample[] {
  const last = samples[samples.length - 1];
  if (last && sample.at === last.at) {
    return last.problem === sample.problem ? samples : [...samples.slice(0, -1), sample];
  }
  if (last && sample.at - last.at < thresholds.minSpacingMs) return samples;

  const kept = [...inWindow(samples, sample.at, thresholds.windowMs), sample];
  return kept.length > MAX_SAMPLES_PER_ORDER
    ? kept.slice(kept.length - MAX_SAMPLES_PER_ORDER)
    : kept;
}
