import {
  candidateTypeChanges,
  damageOf,
  stillToBuyDelta,
  type ImproveMode,
  type ImproveOption,
  type OwnedStock,
} from './improve';
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
  /** What the fit costs now (planning); still to buy when `stock` is given. */
  fitTotal: number | null;
  /** Planning with owned stock counted: with `priceOf`, each owned unit is spent once, in list order. */
  stock?: OwnedStock;
  priceOf?: (typeId: number) => number | null;
  target?: TargetProfile;
}

/** Each row's still-to-buy change in list order: a unit owned is spent by the first row that uses it. */
function spendOwnedOnce(
  options: readonly ImproveOption[],
  priceOf: (typeId: number) => number | null,
  { owned, fitCounts }: OwnedStock
): (number | null)[] {
  const counts = new Map(fitCounts);
  return options.map((option) => {
    const changes = candidateTypeChanges(option.candidate);
    const delta = stillToBuyDelta(changes, priceOf, { owned, fitCounts: counts });
    for (const [typeId, by] of changes) counts.set(typeId, (counts.get(typeId) ?? 0) + by);
    return delta;
  });
}

/** The ticked rows as one set: each row was scored alone, so the combined fit is checked here. */
export function summariseSelection({
  options,
  before,
  after,
  mode,
  spendCap,
  fitTotal,
  stock,
  priceOf,
  target,
}: Params): SelectionSummary {
  const deltas =
    mode === 'buy' && stock && priceOf ? spendOwnedOnce(options, priceOf, stock) : null;
  const iskOf = (index: number) => (deltas ? deltas[index] : options[index].iskDelta);
  const priced = options.filter((_, index) => iskOf(index) !== null);
  const isk = options.reduce((sum, _, index) => sum + (iskOf(index) ?? 0), 0);
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
