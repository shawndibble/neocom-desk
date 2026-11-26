import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { loadGrantedScopes } from './grantedScopes';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { requiredScopesForEndpoints, type EsiEndpointId } from '@/esi/registry';
import { requiredScopesForNavPath } from './routeScopes';

export function useGrantedScopes(): readonly string[] | undefined {
  const hydrated = useActiveCharacter((state) => state.hydrated);
  const activeCharacterId = useActiveCharacter((state) => state.activeCharacterId);
  const scopes = useLiveQuery(async () => {
    if (activeCharacterId === null) return undefined;
    const token = await db.tokens.get(activeCharacterId);
    return token?.scopes ?? [];
  }, [activeCharacterId]);

  if (!hydrated || activeCharacterId === null) return undefined;
  return scopes;
}

export function useLockedRoutes(paths: readonly string[]): ReadonlySet<string> {
  const granted = useGrantedScopes();
  return useMemo(() => {
    if (granted === undefined) return new Set<string>();
    const held = new Set(granted);
    return new Set(
      paths.filter((path) => requiredScopesForNavPath(path).some((scope) => !held.has(scope)))
    );
  }, [granted, paths]);
}

export function useEndpointsGranted(endpoints: readonly EsiEndpointId[]): boolean | undefined {
  const granted = useGrantedScopes();
  return useMemo(() => {
    if (granted === undefined) return undefined;
    const held = new Set(granted);
    return requiredScopesForEndpoints(endpoints).every((scope) => held.has(scope));
  }, [granted, endpoints]);
}

export function useCharacterLacksEndpoints(
  characterId: number | null,
  endpoints: readonly EsiEndpointId[]
): boolean {
  const endpointsKey = endpoints.join(',');
  const answer = useLiveQuery(async () => {
    if (characterId === null) return undefined;
    const held = await loadGrantedScopes(characterId);
    const lacks = requiredScopesForEndpoints(endpoints).some((scope) => !held.has(scope));
    return { characterId, lacks };
  }, [characterId, endpointsKey]);
  return answer?.characterId === characterId && answer.lacks;
}

export { characterIdsWithScopes, useCharacterIdsWithScopes } from './characterIdsWithScopes';
