/**
 * The Build location's job cost index when ESI cannot supply it (J-Space:
 * wormhole systems are absent from `/industry/systems`, and CCP shows the
 * number only in the industry window's Facilities tab). The pilot types what
 * they read there and it replaces whatever the snapshot carries.
 *
 * Pure, so `resolveBuildPlan`, Auto Build and the page all apply it through
 * the one helper and cannot disagree on the figure.
 */
import type { MarketSnapshot } from './marketData';

export type CostIndexSource = 'override' | 'missing' | 'esi';

/**
 * The snapshot with the plan's override standing in for its cost index. A
 * percent in, a fraction out (ESI's unit). Wins over a null index too: the
 * pilot's number is still the best one when ESI was unreachable, and
 * `adjustedPrices` keeps gating the offline signal on its own.
 */
export function applyCostIndexOverride(
  snapshot: MarketSnapshot | null,
  overridePct: number | undefined
): MarketSnapshot | null {
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

/**
 * A typed percent: `number` to set, `null` for blank (clear the override),
 * `undefined` for unreadable (keep the current one). Clamped to 0-100 —
 * `jobCost` throws on a negative index.
 */
export function parseCostIndexPct(raw: string): number | null | undefined {
  const text = raw.trim().replace(',', '.');
  if (text === '') return null;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(100, Math.max(0, value));
}

/** Where a remembered override is filed: the facility if one is picked, else the system. */
export function costIndexMemoryKey(place: {
  buildLocationId?: number;
  buildSystemId?: number;
}): string | null {
  if (place.buildLocationId !== undefined) return `loc:${place.buildLocationId}`;
  if (place.buildSystemId !== undefined) return `sys:${place.buildSystemId}`;
  return null;
}
