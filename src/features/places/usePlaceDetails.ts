import { useEffect, useMemo, useRef, useState } from 'react';
import type { JumpsAwayResult } from '@/engine/jumpsAway';
import { jumpsBetween, type JumpBasis } from '@/features/route/jumpBasis';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { placeKey, placeKindOf } from './classify';
import { productionPlaceSource, resolvePlace } from './resolve';
import type { PlaceDetail, PlaceRef, PlaceSource } from './types';

export interface UsePlaceDetailsOptions {
  /**
   * Whose page this is (the active Character). A change starts over: a
   * structure's system is ACL-checked per Character, so nothing resolved or
   * in flight for the last one may suppress or leak into this one.
   */
  scopeId: number | null;
  /** False reads nothing (no Character yet). Defaults to true. */
  enabled?: boolean;
  /** Where jumps are counted from; `resolved` flips once the origin is known (it may be `null`). `null` skips jumps. */
  origin: { systemId: number | null; resolved: boolean } | null;
  /** The route basis jumps are counted under. `null` skips jumps. */
  basis: Pick<JumpBasis, 'rules' | 'network' | 'key' | 'hydrated'> | null;
  /** Read each Place's name too. Defaults to true; Assets already has its names. */
  names?: boolean;
  source?: PlaceSource;
}

interface Store {
  scope: number | null;
  /** By placeKey; `null` = no system. */
  systems: ReadonlyMap<string, number | null>;
  names: ReadonlyMap<string, string | null>;
  /** By system id, so two Places in one system read it once. */
  security: ReadonlyMap<number, number | null>;
  /** By placeKey + basis + origin: a new basis never reads an old count. */
  jumps: ReadonlyMap<string, JumpsAwayResult>;
}

interface Requested {
  scope: number | null;
  systems: Set<string>;
  security: Set<number>;
  jumps: Set<string>;
}

const emptyStore = (scope: number | null): Store => ({
  scope,
  systems: new Map(),
  names: new Map(),
  security: new Map(),
  jumps: new Map(),
});
const emptyRequested = (scope: number | null): Requested => ({
  scope,
  systems: new Set(),
  security: new Set(),
  jumps: new Set(),
});

const NO_LOCATION: JumpsAwayResult = { kind: 'unknown', reason: 'noLocation' };
const NO_ROUTE: JumpsAwayResult = { kind: 'unknown', reason: 'noRoute' };

/**
 * Name, system, security and jumps away for a set of Places, each landing as
 * it resolves — nothing waits on another Place. Requests are deduped per
 * Place (and per system for security), bounded by `ESI_FANOUT_CONCURRENCY`, and
 * dropped when the scope Character has changed since they were made. A Place
 * with no origin gets `noLocation`, one with no system `noRoute`, never a gap.
 */
export function usePlaceDetails(
  refs: readonly PlaceRef[],
  opts: UsePlaceDetailsOptions
): ReadonlyMap<string, PlaceDetail> {
  const { scopeId, origin, basis, source = productionPlaceSource } = opts;
  const enabled = opts.enabled !== false;
  const wantNames = opts.names !== false;

  // Narrow to the Place *set*, not the caller's array identity: a live query
  // elsewhere on the page hands a new array on every write (issue #415), and
  // re-keying the requests off that would churn for nothing. Adjusting state
  // during render is the sanctioned way to hold the last reference per key.
  const refsKey = refs.map((r) => `${placeKey(r)}:${placeKindOf(r) ?? ''}`).join(',');
  const [stable, setStable] = useState({ key: refsKey, refs });
  if (stable.key !== refsKey) setStable({ key: refsKey, refs });
  // A ref with no Character asks as the scope Character, so a page's refs
  // never hold one that went stale across a switch.
  const stableRefs = useMemo(
    () =>
      stable.refs.map((r) => (r.characterId === undefined ? { ...r, characterId: scopeId } : r)),
    [stable.refs, scopeId]
  );

  const [store, setStore] = useState<Store>(() => emptyStore(scopeId));
  const requested = useRef<Requested>(emptyRequested(scopeId));
  // A request writes only if its scope is still the current one: a plain
  // per-effect `cancelled` flag would also trip on an unrelated re-render that
  // merely re-identifies the inputs, and since the request is already marked
  // in `requested` it would never be retried.
  const current = store.scope === scopeId ? store : emptyStore(scopeId);

  function claim(): Requested {
    if (requested.current.scope !== scopeId) requested.current = emptyRequested(scopeId);
    return requested.current;
  }
  function write(scope: number | null, update: (base: Store) => Store) {
    if (requested.current.scope !== scope) return;
    setStore((prev) => update(prev.scope === scope ? prev : emptyStore(scope)));
  }

  const originId = origin?.systemId ?? null;
  const originResolved = origin?.resolved ?? false;
  const jumpsSuffix = basis ? `${basis.key}:${originId ?? ''}` : '';
  // A count is only valid under the basis and origin it was made for.
  const jumpsKeyOf = (key: string) => `${key}:${jumpsSuffix}`;

  useEffect(() => {
    if (!enabled) return;
    const req = claim();
    const missing = stableRefs.filter((r) => {
      const key = placeKey(r);
      return !current.systems.has(key) && !req.systems.has(key);
    });
    if (missing.length === 0) return;
    for (const r of missing) req.systems.add(placeKey(r));
    const scope = scopeId;
    void mapWithConcurrencyLimit(missing, ESI_FANOUT_CONCURRENCY, async (r) => {
      const place = await resolvePlace(r, source, { name: wantNames, settle: true });
      const key = placeKey(r);
      write(scope, (base) => ({
        ...base,
        systems: new Map(base.systems).set(key, place.systemId),
        names: wantNames ? new Map(base.names).set(key, place.name) : base.names,
      }));
    });
    // `claim`/`write` are per-render closures over `scopeId` (listed), not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeId, stableRefs, current.systems, source, wantNames]);

  useEffect(() => {
    if (!enabled || !basis || !basis.hydrated || !originResolved) return;
    const req = claim();
    const pending = stableRefs.filter((r) => {
      const key = jumpsKeyOf(placeKey(r));
      if (current.jumps.has(key) || req.jumps.has(key)) return false;
      return originId === null || current.systems.has(placeKey(r));
    });
    if (pending.length === 0) return;
    for (const r of pending) req.jumps.add(jumpsKeyOf(placeKey(r)));
    const scope = scopeId;
    void mapWithConcurrencyLimit(pending, ESI_FANOUT_CONCURRENCY, async (r) => {
      const key = placeKey(r);
      const systemId = current.systems.get(key) ?? null;
      let result: JumpsAwayResult;
      if (originId === null) result = NO_LOCATION;
      else if (systemId === null) result = NO_ROUTE;
      else result = await jumpsBetween(originId, systemId, basis).catch(() => NO_ROUTE);
      write(scope, (base) => ({
        ...base,
        jumps: new Map(base.jumps).set(jumpsKeyOf(key), result),
      }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    enabled,
    scopeId,
    stableRefs,
    current.jumps,
    current.systems,
    basis,
    originId,
    originResolved,
    jumpsSuffix,
  ]);

  useEffect(() => {
    if (!enabled) return;
    const req = claim();
    const missing = new Set<number>();
    for (const r of stableRefs) {
      const systemId = current.systems.get(placeKey(r));
      if (systemId != null && !current.security.has(systemId) && !req.security.has(systemId)) {
        missing.add(systemId);
      }
    }
    if (missing.size === 0) return;
    for (const id of missing) req.security.add(id);
    const scope = scopeId;
    void mapWithConcurrencyLimit([...missing], ESI_FANOUT_CONCURRENCY, async (systemId) => {
      const security = await source.systemSecurity(systemId).catch(() => null);
      write(scope, (base) => ({
        ...base,
        security: new Map(base.security).set(systemId, security),
      }));
    });
    // `claim`/`write` are per-render closures over `scopeId` (listed), not deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, scopeId, stableRefs, current.systems, current.security, source]);

  return useMemo(() => {
    const details = new Map<string, PlaceDetail>();
    for (const r of stableRefs) {
      const key = placeKey(r);
      const systemId = current.systems.get(key);
      details.set(key, {
        name: current.names.get(key),
        systemId,
        // No system (pending or none) passes straight through.
        security: systemId == null ? systemId : current.security.get(systemId),
        jumps: basis ? current.jumps.get(jumpsKeyOf(key)) : undefined,
      });
    }
    return details;
  }, [stableRefs, current, basis, jumpsSuffix]); // eslint-disable-line react-hooks/exhaustive-deps -- jumpsKeyOf derives from jumpsSuffix
}
