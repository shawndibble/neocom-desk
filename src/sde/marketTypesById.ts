/**
 * `public/data/market/types.json` read as a lookup by type id — the
 * `solarSystems.ts` pattern, applied to the market catalogue.
 *
 * The catalogue is ~1.5 MB of every published market type. Callers that only
 * need "what is type N called" used to rebuild a `Map` over all of it (or scan
 * it end to end) on every call; indexing it once per session makes each of
 * those a map read.
 *
 * Unlike `solarSystems.ts`, a failed read rejects rather than resolving
 * `null`: every caller already treats an unreadable catalogue as an error
 * (the same contract `loadMarketTypes` itself has). The failure is not
 * memoized, so a later call that can reach the file still gets it.
 */
import { loadMarketTypes } from './loadMarketSde';
import type { MarketTypeEntry } from './marketTypes';

let index: Promise<ReadonlyMap<number, MarketTypeEntry>> | null = null;

/** The whole market catalogue keyed by type id, built once per session. */
export function loadMarketTypesById(): Promise<ReadonlyMap<number, MarketTypeEntry>> {
  if (index) return index;
  const pending = loadMarketTypes()
    .then((entries): ReadonlyMap<number, MarketTypeEntry> => {
      const map = new Map<number, MarketTypeEntry>();
      for (const entry of entries) map.set(entry.typeId, entry);
      return map;
    })
    .catch((error: unknown) => {
      // Allow retry after failure — unless a clear already replaced this load.
      if (index === pending) index = null;
      throw error;
    });
  index = pending;
  return pending;
}

/** Test-only: drops the memoized index so tests can swap the catalogue between cases. */
export function clearMarketTypeIndex(): void {
  index = null;
}
