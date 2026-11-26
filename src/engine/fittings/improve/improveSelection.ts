import { damageOf, type ImproveOption } from './improve';
import { overageOf, RESOURCES, type Resource } from '../makeItFit';
import type { TargetProfile } from '../targetProfile';
import type { FittingStats } from '../types';

export type SelectionProblem =
  { kind: 'over'; resource: Resource } | { kind: 'capStable' } | { kind: 'spend' };

export interface SelectionSummary {
  count: number;
  isk: number;
  unpriced: number;
  total: number | null;
  dps: { before: number; after: number };
  ehp: { before: number; after: number };
  problems: SelectionProblem[];
}

interface Params {
  options: readonly ImproveOption[];
  before: FittingStats;
  after: FittingStats;
  iskBudget: number | null;
  fitTotal: number | null;
  target?: TargetProfile;
}

export function summariseSelection({
  options,
  before,
  after,
  iskBudget,
  fitTotal,
  target,
}: Params): SelectionSummary {
  const priced = options.filter((option) => option.iskDelta !== null);
  const isk = options.reduce((sum, option) => sum + (option.iskDelta ?? 0), 0);
  const total = fitTotal !== null ? fitTotal + isk : null;
  const problems: SelectionProblem[] = [
    ...RESOURCES.filter((resource) => overageOf(after, resource) > 0).map(
      (resource): SelectionProblem => ({ kind: 'over', resource })
    ),
    ...(before.capacitor.stable && !after.capacitor.stable ? [{ kind: 'capStable' } as const] : []),
    ...(iskBudget !== null && total !== null && total > iskBudget
      ? [{ kind: 'spend' } as const]
      : []),
  ];
  return {
    count: options.length,
    isk,
    unpriced: options.length - priced.length,
    total,
    dps: { before: damageOf(before, target), after: damageOf(after, target) },
    ehp: { before: before.ehp, after: after.ehp },
    problems,
  };
}
