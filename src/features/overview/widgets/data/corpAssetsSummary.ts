/**
 * What the Corp assets widget reads off the corp asset ledger (issue #4671):
 * stack counts and estimated value for the states a Director must act on, and
 * the usable stock per item type so the widget can count types below target
 * without holding every stack. Pure; the loader runs it once per read, the
 * builder re-counts "below target" against the live targets.
 */
import {
  buildItemLedger,
  countLedgerByState,
  evaluateStockTargets,
  type ClassifiedAsset,
  type LedgerState,
} from '@/engine/corp/assetLedger';

export interface StateTotal {
  /** Asset stacks (one per item row), the same count the page's tab badge shows. */
  stacks: number;
  /** Estimated value in ISK, from the page's price and copy-value inputs. */
  value: number;
}

export interface CorpAssetsSummary {
  assetSafety: StateTotal;
  impounded: StateTotal;
  /** Value is carried for symmetry but the widget shows the count only. */
  deliveries: StateTotal;
  /** Every stack the corporation has, whatever its state: tells "no assets" from "all clear". */
  totalStacks: number;
  /** Usable stock (Offices + Corp deliveries, originals only) by type id; types with none are absent. */
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
  const rows = buildItemLedger(items, { ...options, filter: { state } });
  return { stacks, value: rows.reduce((sum, row) => sum + row.estimatedValue, 0) };
}

export function summariseCorpAssets(
  items: readonly ClassifiedAsset[],
  options: SummariseOptions
): CorpAssetsSummary {
  const counts = countLedgerByState(items);
  // Asking for a target of 1 on every type reuses the ledger's own owned-count rule.
  const everyType = new Map([...new Set(items.map((i) => i.input.typeId))].map((id) => [id, 1]));
  const usableByType = new Map<number, number>();
  for (const [typeId, status] of evaluateStockTargets(everyType, items)) {
    if (status.owned > 0) usableByType.set(typeId, status.owned);
  }
  return {
    assetSafety: totalFor(items, 'assetSafety', counts, options),
    impounded: totalFor(items, 'impounded', counts, options),
    deliveries: totalFor(items, 'deliveries', counts, options),
    totalStacks: counts.all,
    usableByType,
  };
}

/** Types whose target is not met: short, or none owned. Same rule as the page's Below target chip. */
export function countShortTypes(
  targets: ReadonlyMap<number, number>,
  usableByType: ReadonlyMap<number, number>
): number {
  let short = 0;
  for (const [typeId, target] of targets) if ((usableByType.get(typeId) ?? 0) < target) short += 1;
  return short;
}
