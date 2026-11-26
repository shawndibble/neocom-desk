import { clampPct } from '@/lib/clampPct';
import type { MarketSnapshot } from './marketData';

export type CostIndexSource = 'override' | 'missing' | 'esi';

export function applyCostIndexOverride<S extends MarketSnapshot | null>(
  snapshot: S,
  overridePct: number | undefined
): S {
  if (!snapshot || overridePct === undefined) return snapshot;
  return { ...snapshot, systemCostIndex: overridePct / 100, systemCostIndexMissing: false };
}

export function costIndexSource(
  snapshot: MarketSnapshot | null,
  overridePct: number | undefined
): CostIndexSource {
  if (overridePct !== undefined) return 'override';
  return snapshot?.systemCostIndexMissing ? 'missing' : 'esi';
}

export function parseCostIndexPct(raw: string): number | null | undefined {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return clampPct(value);
}
