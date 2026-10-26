/**
 * The last Market-Wide scans, kept across the panel's mounts (issue #5232): a
 * row click opens a plan page, and Back must show the same rows rather than ask
 * the pilot to scan again. Same shape as Build Opportunities' `rowsCache`
 * (`opportunities.ts`) — module-level, outside React state, keyed by what the
 * rows were priced at — plus an expiry, because these rows ride on hub prices
 * that go stale (`HUB_PRICE_TTL_MS`).
 *
 * A scan priced at other inputs is simply absent under the new key, so it can
 * never be shown as current. Nothing here fetches: a miss reads as "never run".
 */
import type { BlueprintSource } from '@/engine/industry/blueprintObtainability';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import type { ResolvedStandings } from '@/engine/market/standings';
import { HUB_PRICE_TTL_MS } from '@/market/prices';
import type { MarketWideResultRow } from './marketWideOpportunities';

/** Everything a scan's rows depend on. Sort, share, page size and the build-cost cap only re-view the rows, so they are not here. */
export interface MarketWideScanInputs {
  hubId: string;
  /** The filters that apply before the top-N cut. */
  tiers: ReadonlySet<string>;
  categories: ReadonlySet<string>;
  sources: ReadonlySet<string>;
  characterIds: readonly number[];
  assumedMe: number;
  assumedTe: number;
  /** The active Character's owned copies, whose ME/TE a plan opened from a row starts at. */
  research: readonly { blueprintTypeID: number; me: number; te: number }[];
  modifiers: CharacterModifiers;
  standing: ResolvedStandings | undefined;
}

export function marketWideScanKey(inputs: MarketWideScanInputs): string {
  return JSON.stringify([
    inputs.hubId,
    [...inputs.tiers].sort(),
    [...inputs.categories].sort(),
    [...inputs.sources].sort(),
    [...inputs.characterIds].sort((a, b) => a - b),
    inputs.assumedMe,
    inputs.assumedTe,
    inputs.research.map(({ blueprintTypeID, me, te }) => `${blueprintTypeID}:${me}:${te}`).sort(),
    inputs.modifiers,
    inputs.standing ?? null,
  ]);
}

export interface MarketWideScanEntry {
  rows: MarketWideResultRow[];
  /** Epoch ms the scan finished. */
  fetchedAt: number;
  unavailableSources: BlueprintSource[];
}

const scans = new Map<string, MarketWideScanEntry>();

/** The scan written under `key`, unless it has outlived the price TTL (then it is dropped). */
export function readMarketWideScan(
  key: string,
  now: number = Date.now()
): MarketWideScanEntry | undefined {
  const entry = scans.get(key);
  if (!entry) return undefined;
  if (now - entry.fetchedAt >= HUB_PRICE_TTL_MS) {
    scans.delete(key);
    return undefined;
  }
  return entry;
}

export function writeMarketWideScan(key: string, entry: MarketWideScanEntry): void {
  scans.set(key, entry);
}

/** Test-only. */
export function clearMarketWideScanCache(): void {
  scans.clear();
}
