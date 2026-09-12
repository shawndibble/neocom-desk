/**
 * The name lookups the Contract Search boards read, each resolved *behind* its
 * table rather than in front of it (issue #963).
 *
 * They used to be three serial stages of one atomic loader, so the panel spun
 * until the last of them landed — and a hauler opening Courier waited on a
 * 1.45 MB market catalogue that only the Items board ever reads. Every
 * consumer already renders an unresolved id honestly (`#30000142`, the raw
 * location id), which is what makes filling in late safe: a row is never
 * wrong while a name is missing, only less readable.
 *
 * Measured (2026-09-12): the parsing and scanning here is single-digit
 * milliseconds — 5 ms for the 19,551-entry catalogue scan, 3 ms for 1,240
 * station lookups. The wait is `loadRegionName`'s one ESI call per distinct
 * region on a cold cache, which is why that is the only stage worth naming in
 * the UI while it runs.
 */
import { useEffect, useMemo, useState } from 'react';
import { loadMarketTypes } from '@/sde/loadMarketSde';
import { loadRegionName } from '@/features/bpcContracts/regionNames';
import type { CourierEndpoint, PublicCourierContractRow } from '@/engine/contracts/courierSearch';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import { loadCourierEndpoints } from './courierEndpoints';

const EMPTY_NAMES: ReadonlyMap<number, string> = new Map();
const EMPTY_ENDPOINTS: ReadonlyMap<number, CourierEndpoint> = new Map();

/**
 * An answer that carries the input it was computed for, so "still resolving"
 * is *derived* during render rather than written by the effect — the same
 * shape `CourierResults`'s jump counts use, and for the same reason: an answer
 * whose input is no longer current is stale by definition, so the view reads
 * as resolving the instant the input changes, with no extra render.
 *
 * The previous answer is *kept* while the next one resolves, rather than
 * falling back to the empty map. Every input here is a fresh array off a fresh
 * `CachedResult`, and `useRouteSnapshot` re-runs its loader on every global
 * revalidation signal — so blanking on an input change would wipe the names
 * off a fully-loaded board whenever any other page's cache refreshed. A name
 * map from the previous read is still correct for every id it holds: these are
 * keyed by type, location and region id, none of which are reassigned.
 *
 * `resolve` and `fallback` must be module-level constants; every caller below
 * passes one, which is what lets the effect depend on them honestly.
 */
function useResolved<TInput, TValue>(
  input: TInput,
  resolve: (input: TInput) => Promise<TValue>,
  fallback: TValue
): { value: TValue; resolving: boolean } {
  const [answer, setAnswer] = useState<{ input: TInput; value: TValue } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void resolve(input)
      // A lookup that throws must settle as "resolved, with nothing" rather
      // than leave `resolving` true for the life of the mount. These used to
      // run inside the route loader, where a throw surfaced as its `error`;
      // behind the table there is no such reporting channel, and an unresolved
      // id is what every consumer already renders anyway. Same trade as
      // `features/market/useCompareRows.ts`.
      .catch(() => fallback)
      .then((value) => {
        if (!cancelled) setAnswer({ input, value });
      });
    return () => {
      cancelled = true;
    };
  }, [input, resolve, fallback]);

  const current = answer !== null && answer.input === input ? answer : null;
  return { value: current?.value ?? answer?.value ?? fallback, resolving: current === null };
}

/**
 * Names for the types actually listed, out of the market catalogue
 * (`public/data/market/types.json`) rather than `loadTypeNames`: the slim
 * `types.json` the latter reads only covers skill- and blueprint-referenced
 * types, so a general contract corpus would send most of its ids to the
 * batched `POST /universe/names` fan-out on every tab open. The catalogue
 * already names every published market type and is what the Market Browser's
 * own search runs against.
 *
 * Items-board only. Loading it here rather than in the shared loader is what
 * stops the Courier board waiting on 1.45 MB it never reads.
 */
export function useListedTypeNames(rows: readonly PublicContractOfferRow[]): {
  value: ReadonlyMap<number, string>;
  resolving: boolean;
} {
  return useResolved(rows, resolveTypeNames, EMPTY_NAMES);
}

async function resolveTypeNames(
  rows: readonly PublicContractOfferRow[]
): Promise<ReadonlyMap<number, string>> {
  if (rows.length === 0) return EMPTY_NAMES;
  const listed = new Set(rows.map((row) => row.typeId));
  const catalog = await loadMarketTypes();
  const names = new Map<number, string>();
  for (const entry of catalog) {
    if (listed.has(entry.typeId)) names.set(entry.typeId, entry.name);
  }
  return names;
}

/**
 * Both ends of every haul, as far as the local SDE snapshots reach, keyed by
 * location id. Costs no requests at all — see `courierEndpoints.ts` for why it
 * is not `loadContractLocationName`.
 *
 * A map rather than the finished rows: `resolveCourierRoutes` turns rows plus
 * whatever endpoints are known into rows, so the board always has every haul
 * and an unplaced end simply carries its raw location id — which is what it
 * shows for a player structure regardless. Resolving the *rows* here instead
 * would mean the board had none at all until this settled.
 */
export function useCourierEndpoints(rows: readonly PublicCourierContractRow[]): {
  value: ReadonlyMap<number, CourierEndpoint>;
  resolving: boolean;
} {
  return useResolved(rows, resolveEndpoints, EMPTY_ENDPOINTS);
}

async function resolveEndpoints(
  rows: readonly PublicCourierContractRow[]
): Promise<ReadonlyMap<number, CourierEndpoint>> {
  if (rows.length === 0) return EMPTY_ENDPOINTS;
  return loadCourierEndpoints(rows);
}

/**
 * One lookup per distinct region, committed as a single map when they have all
 * answered rather than per region as it lands. Both boards render a Region
 * column and rebuild their column set when this map changes, so a per-region
 * commit would rebuild it once per region — dozens of times, for a cosmetic
 * gain over a stage note that says the same thing.
 */
export function useRegionNames(regionIds: readonly number[]): {
  value: ReadonlyMap<number, string>;
  resolving: boolean;
} {
  // Sorted and joined so the effect keys on which regions, not on the order
  // two independently-loaded corpora happened to contribute them in.
  const key = useMemo(() => [...regionIds].sort((a, b) => a - b).join(','), [regionIds]);
  const ids = useMemo(() => (key === '' ? [] : key.split(',').map(Number)), [key]);
  return useResolved(ids, resolveRegionNames, EMPTY_NAMES);
}

async function resolveRegionNames(
  regionIds: readonly number[]
): Promise<ReadonlyMap<number, string>> {
  if (regionIds.length === 0) return EMPTY_NAMES;
  const names = new Map<number, string>();
  await Promise.all(
    regionIds.map(async (regionId) => {
      const name = await loadRegionName(regionId);
      if (name !== null) names.set(regionId, name);
    })
  );
  return names;
}
