// Reads the active Character's OAuth grant out of Dexie for the scope gate and
// the nav. Its own module so `ScopeGate.tsx` exports components only.
import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { requiredScopesForRoute, type AppRoutePath } from './routeScopes';

/**
 * The active Character's granted OAuth scopes, live from Dexie.
 * `undefined` while the read is in flight.
 *
 * Only `scopes` is lifted out of the `TokenRecord`; the refresh token stays in
 * Dexie and never reaches React state or a log (ADR 0001).
 */
export function useGrantedScopes(): readonly string[] | undefined {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const scopes = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    const token = await db.tokens.get(activeCharacterId);
    // No token row means no grant at all, which is exactly what the gate is
    // for — not a reason to fall through as if everything were permitted.
    return token?.scopes ?? [];
  }, [activeCharacterId]);

  // "No active Character" is not "granted nothing". `hydrate()` is async, so
  // `activeCharacterId` is null for the first frames of every cold load, and
  // answering `[]` there would paint a re-auth banner over a perfectly healthy
  // Character before the route's own redirect to /characters ran. Unknown ⇒
  // the caller passes the view through.
  if (!hydrated || activeCharacterId === null) return undefined;
  return scopes;
}

/**
 * Which of `paths` the active Character currently cannot use. `Layout` calls
 * this with all 11 nav paths on every render (character switch, opening the
 * mobile More sheet, a live-query tick), so this is memoized on `granted` —
 * and, deliberately not going through `missingScopesForRoute` (which builds
 * its own `Set` from `granted` on every call), the granted-scope `Set` is
 * built once here and reused across all `paths` instead of once per path.
 * Keep this in step with `missingScopesForRoute`'s "missing" definition if
 * that ever changes.
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
