import {
  buildItemLedger,
  countLedgerByState,
  evaluateStockTargets,
  type ClassifiedAsset,
  type LedgerState,
} from '@/engine/corp/assetLedger';

export interface StateTotal {
  stacks: number;
  value: number | null;
}

export interface CorpAssetsSummary {
  assetSafety: StateTotal;
  impounded: StateTotal;
  deliveries: Pick<StateTotal, 'stacks'>;
  totalStacks: number;
  usableByType: ReadonlyMap<number, number>;
}

export interface SummariseOptions {
  prices: ReadonlyMap<number, number>;
  copyValues?: ReadonlyMap<number, number>;
}

function totalFor(
  items: readonly ClassifiedAsset[],
  state: LedgerState,
  counts: Record<string, number>,
  options: SummariseOptions
): StateTotal {
  const stacks = counts[state] ?? 0;
  if (stacks === 0) return { stacks, value: 0 };
  if (options.prices.size === 0) return { stacks, value: null };
  const rows = buildItemLedger(items, { ...options, filter: { state } });
  return { stacks, value: rows.reduce((sum, row) => sum + row.estimatedValue, 0) };
}

export function summariseCorpAssets(
  items: readonly ClassifiedAsset[],
  options: SummariseOptions
): CorpAssetsSummary {
  const counts = countLedgerByState(items);
  const everyType = new Map([...new Set(items.map((i) => i.input.typeId))].map((id) => [id, 1]));
  const usableByType = new Map<number, number>();
  for (const [typeId, status] of evaluateStockTargets(everyType, items)) {
    if (status.owned > 0) usableByType.set(typeId, status.owned);
  }
  return {
    assetSafety: totalFor(items, 'assetSafety', counts, options),
    impounded: totalFor(items, 'impounded', counts, options),
    deliveries: { stacks: counts.deliveries ?? 0 },
    totalStacks: counts.all,
    usableByType,
  };
}

export function countShortTypes(
  targets: ReadonlyMap<number, number>,
  usableByType: ReadonlyMap<number, number>
): number {
  let short = 0;
  for (const [typeId, target] of targets) if ((usableByType.get(typeId) ?? 0) < target) short += 1;
  return short;
}
