export type OrderProblem =
  | 'belowFloor'
  | 'undercutStation'
  | 'undercutSystem'
  | 'undercutRegion'
  | 'expiringOrStale'
  | 'outbid'
  | 'turnInPays'
  | 'healthy';

export const ORDER_PROBLEMS: readonly OrderProblem[] = [
  'belowFloor',
  'undercutStation',
  'undercutSystem',
  'undercutRegion',
  'expiringOrStale',
  'outbid',
  'turnInPays',
  'healthy',
];

export const UNDERCUT_PROBLEMS: readonly OrderProblem[] = [
  'undercutStation',
  'undercutSystem',
  'undercutRegion',
];

export function isRealProblem(problem: OrderProblem): boolean {
  return problem !== 'healthy' && problem !== 'turnInPays';
}

export interface OrderProblemFacts {
  isBuyOrder: boolean;
  belowFloor: boolean;
  undercutScope: 'station' | 'system' | 'region' | null;
  daysLeft: number | null;
  volumeRemain: number;
  daysWithoutSale: number | null;
  outlastsOrder: boolean;
  turnInBeatsPrice?: boolean;
}

export interface ProblemThresholds {
  expiringWithinDays: number;
  staleAfterDays: number;
}

export const DEFAULT_PROBLEM_THRESHOLDS: ProblemThresholds = {
  expiringWithinDays: 7,
  staleAfterDays: 12,
};

function isExpiringOrStale(facts: OrderProblemFacts, thresholds: ProblemThresholds): boolean {
  const { daysLeft, volumeRemain, daysWithoutSale, outlastsOrder } = facts;

  if (volumeRemain > 0 && daysLeft !== null && daysLeft <= thresholds.expiringWithinDays) {
    return true;
  }
  if (daysWithoutSale !== null && daysWithoutSale >= thresholds.staleAfterDays) {
    return true;
  }
  if (volumeRemain > 0 && outlastsOrder) {
    return true;
  }
  return false;
}

function applicableProblems(
  facts: OrderProblemFacts,
  thresholds: ProblemThresholds
): OrderProblem[] {
  const problems: OrderProblem[] = [];

  if (facts.isBuyOrder) {
    if (facts.undercutScope !== null) problems.push('outbid');
  } else {
    if (facts.belowFloor) problems.push('belowFloor');
    if (facts.undercutScope === 'station') problems.push('undercutStation');
    if (facts.undercutScope === 'system') problems.push('undercutSystem');
    if (facts.undercutScope === 'region') problems.push('undercutRegion');
  }

  if (isExpiringOrStale(facts, thresholds)) problems.push('expiringOrStale');
  if (!facts.isBuyOrder && facts.turnInBeatsPrice === true) problems.push('turnInPays');

  return problems;
}

export function worstProblem(
  facts: OrderProblemFacts,
  thresholds: ProblemThresholds = DEFAULT_PROBLEM_THRESHOLDS
): OrderProblem {
  return applicableProblems(facts, thresholds)[0] ?? 'healthy';
}

export function allProblems(
  facts: OrderProblemFacts,
  thresholds: ProblemThresholds = DEFAULT_PROBLEM_THRESHOLDS
): OrderProblem[] {
  const problems = applicableProblems(facts, thresholds);
  return problems.length > 0 ? problems : ['healthy'];
}
