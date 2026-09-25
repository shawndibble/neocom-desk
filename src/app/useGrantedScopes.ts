// Its own module so `ScopeGate.tsx` exports components only.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { requiredScopesForRoute, type AppRoutePath } from './routeScopes';

/**
 * The active Character's granted OAuth scopes, live from Dexie; `undefined`
 * while unknown. Only `scopes` is lifted out of the `TokenRecord` — the refresh
 * token never reaches React state or a log (ADR 0001).
 */
export function useGrantedScopes(): readonly string[] | undefined {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const scopes = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    const token = await db.tokens.get(activeCharacterId);
    // No token row means no grant at all — exactly what the gate is for, not a
    // reason to fall through as if everything were permitted.
    return token?.scopes ?? [];
  }, [activeCharacterId]);

  // "No active Character" is not "granted nothing": `hydrate()` is async, so
  // this is null for the first frames of every cold load, and answering `[]`
  // would paint a re-auth banner over a perfectly healthy Character.
  if (!hydrated || activeCharacterId === null) return undefined;
  return scopes;
}

/**
 * Which of `paths` the active Character currently cannot use. `Layout` calls
 * this with all 11 nav paths on every render, so the granted-scope `Set` is
 * built once here and reused, rather than once per path inside
 * `missingScopesForRoute`. Keep the two "missing" definitions in step.
 */
export function useLockedRoutes(paths: readonly AppRoutePath[]): ReadonlySet<AppRoutePath> {
  const granted = useGrantedScopes();
  return useMemo(() => {
    if (granted === undefined) return new Set<AppRoutePath>();
    const held = new Set(granted);
    return new Set(
      paths.filter((path) => requiredScopesForRoute(path).some((scope) => !held.has(scope)))
    );
  }, [granted, paths]);
}

/**
 * Whether the active Character's grant covers every scope `endpoints`
 * declares — for a figure that degrades to a documented assumption rather
 * than gating a whole page (issue #1526). `undefined` while the grant is
 * still unknown, so a caller can hold its note back rather than flash it on
 * a cold load, same as `useGrantedScopes` itself.
 */
export function useEndpointsGranted(endpoints: readonly EsiEndpointId[]): boolean | undefined {
  const granted = useGrantedScopes();
  return useMemo(() => {
    if (granted === undefined) return undefined;
    const held = new Set(granted);
    return requiredScopesForEndpoints(endpoints).every((scope) => held.has(scope));
  }, [granted, endpoints]);
}

/**
 * Whether `characterId`'s stored grant is known to lack a scope `endpoints`
 * declares — the per-Character twin of `useEndpointsGranted`, for a figure
 * priced under a Character that need not be the active one (issues #1588,
 * #1589). `false` while unknown, for no Character, and once granted: the
 * answer a Grant note shows on. Only the answer leaves the query, so no
 * `TokenRecord` reaches React state (ADR 0001).
 */
export function useCharacterLacksEndpoints(
  characterId: number | null,
  endpoints: readonly EsiEndpointId[]
): boolean {
  // Keyed by value: callers may rebuild the array every render.
  const endpointsKey = endpoints.join(',');
  const answer = useLiveQuery(async () => {
    if (characterId === null) return undefined;
    const held = new Set((await db.tokens.get(characterId))?.scopes ?? []);
    const lacks = requiredScopesForEndpoints(endpoints).some((scope) => !held.has(scope));
    return { characterId, lacks };
  }, [characterId, endpointsKey]);
  // Checked against `characterId`: right after it changes the query still
  // holds the previous Character's answer for a frame.
  return answer?.characterId === characterId && answer.lacks;
}
