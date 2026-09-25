// Its own module so `ScopeGate.tsx` exports components only.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { requiredScopesForRoute, type AppRoutePath } from './routeScopes';

/**
 * A Character's granted OAuth scopes, live from Dexie; `undefined` while
 * unknown. Defaults to the active Character; pass `characterId` for a figure
 * priced for someone else (a Build Plan's owner, one row of a multi-character
 * list). Only `scopes` is lifted out of the `TokenRecord` — the refresh token
 * never reaches React state or a log (ADR 0001).
 */
export function useGrantedScopes(characterId?: number | null): readonly string[] | undefined {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const targetId = characterId === undefined ? activeCharacterId : characterId;
  const grant = useLiveQuery(async () => {
    if (targetId === null) return undefined;
    const token = await db.tokens.get(targetId);
    // No token row means no grant at all — exactly what the gate is for, not a
    // reason to fall through as if everything were permitted.
    return { characterId: targetId, scopes: token?.scopes ?? [] };
  }, [targetId]);

  // "No active Character" is not "granted nothing": `hydrate()` is async, so
  // this is null for the first frames of every cold load, and answering `[]`
  // would paint a re-auth banner over a perfectly healthy Character. An
  // explicit `characterId` is already known, so it doesn't wait on that.
  if (characterId === undefined && !hydrated) return undefined;
  if (targetId === null) return undefined;
  // `useLiveQuery` keeps its last result across a dep change, so a switch of
  // Character would briefly answer with the previous one's grant.
  return grant?.characterId === targetId ? grant.scopes : undefined;
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
 * Whether a Character's grant (the active one's unless `characterId` is
 * given) covers every scope `endpoints` declares — for a figure that degrades to a documented assumption rather
 * than gating a whole page (issue #1526). `undefined` while the grant is
 * still unknown, so a caller can hold its note back rather than flash it on
 * a cold load, same as `useGrantedScopes` itself.
 */
export function useEndpointsGranted(
  endpoints: readonly EsiEndpointId[],
  characterId?: number | null
): boolean | undefined {
  const granted = useGrantedScopes(characterId);
  return useMemo(() => {
    if (granted === undefined) return undefined;
    const held = new Set(granted);
    return requiredScopesForEndpoints(endpoints).every((scope) => held.has(scope));
  }, [granted, endpoints]);
}
