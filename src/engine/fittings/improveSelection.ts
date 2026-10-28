import { damageOf, type ImproveMode, type ImproveOption } from './improve';
import { overageOf, RESOURCES, type Resource } from './makeItFit';
import type { TargetProfile } from './targetProfile';
import type { FittingStats } from './types';

export type SelectionProblem =
  { kind: 'over'; resource: Resource } | { kind: 'capStable' } | { kind: 'spend' };

export interface SelectionSummary {
  count: number;
  /** Sum of the priced rows' cost: new minus old, or net extra spend when refitting. */
  isk: number;
  /** Rows with no hub price, which `isk` leaves out. */
  unpriced: number;
  /** The whole fit's price with the set made; planning only, null when the fit's price is unknown. */
  total: number | null;
  dps: { before: number; after: number };
  ehp: { before: number; after: number };
  /** What stops the set being applied; empty means it fits. */
  problems: SelectionProblem[];
}

interface Params {
  options: readonly ImproveOption[];
  /** The fit's own stats, under the same conditions as `after`. */
  before: FittingStats;
  /** One whole-fit recalculation of every ticked row made together. */
  after: FittingStats;
  mode: ImproveMode;
  spendCap: number | null;
  /** What the fit costs now (planning). */
  fitTotal: number | null;
  target?: TargetProfile;
}

/** The ticked rows as one set: each row was scored alone, so the combined fit is checked here. */
export function summariseSelection({
  options,
  before,
  after,
  mode,
  spendCap,
  fitTotal,
  target,
}: Params): SelectionSummary {
  const priced = options.filter((option) => option.iskDelta !== null);
  const isk = options.reduce((sum, option) => sum + (option.iskDelta ?? 0), 0);
  const total = mode === 'buy' && fitTotal !== null ? fitTotal + isk : null;
  const problems: SelectionProblem[] = [
    ...RESOURCES.filter((resource) => overageOf(after, resource) > 0).map(
      (resource): SelectionProblem => ({ kind: 'over', resource })
    ),
    ...(before.capacitor.stable && !after.capacitor.stable ? [{ kind: 'capStable' } as const] : []),
    ...(spendCap !== null &&
    (mode === 'buy' ? total : isk) !== null &&
    (mode === 'buy' ? total! : isk) > spendCap
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
