// Its own module so `ScopeGate.tsx` exports components only.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
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
