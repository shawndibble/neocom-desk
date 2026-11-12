import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import { useBatchedMap } from '@/lib/useBatchedMap';
import {
  CORP_ROLES_SCOPE,
  CORP_STANDING_SCOPES,
  corpStanding,
  type CorpStanding,
} from './corpStanding';
import { corpWideRoles, loadCharacterRoles } from './roles';

/** Cached-first roles read; null when nothing could be read (a refused login is the app-wide notice's job). */
async function loadRoles(entry: string): Promise<readonly string[] | null> {
  const { cached } = await loadCharacterRoles(Number(entry));
  return cached ? corpWideRoles(cached.data) : null;
}

/**
 * Each listed Character's corporation standing; a Character is absent until
 * known. Reads roles only for Characters whose grant holds the roles scope —
 * without it the read is a guaranteed 403 — through the same hour-cached read
 * every corp surface uses, a few at a time. Pass no ids to read nothing.
 */
export function useCharacterCorpStanding(
  characterIds: readonly number[]
): ReadonlyMap<number, CorpStanding> {
  const idsKey = characterIds.join(',');
  // Only the corp scopes leave the token read (ADR 0001).
  const scopesById = useLiveQuery(async () => {
    const ids = idsKey === '' ? [] : idsKey.split(',').map(Number);
    const tokens = await db.tokens.bulkGet(ids);
    return new Map(
      ids.map((id, index) => [
        id,
        (tokens[index]?.scopes ?? []).filter((scope) =>
          (CORP_STANDING_SCOPES as readonly string[]).includes(scope)
        ),
      ])
    );
  }, [idsKey]);
  // Keyed by value: any token write re-runs the live query into a fresh Map.
  const rolesKey = scopesById
    ? [...scopesById]
        .filter(([, scopes]) => scopes.includes(CORP_ROLES_SCOPE))
        .map(([id]) => id)
        .join(',')
    : '';
  const { values: rolesById } = useBatchedMap(rolesKey, loadRoles);
  return useMemo(() => {
    const standings = new Map<number, CorpStanding>();
    for (const [id, scopes] of scopesById ?? []) {
      const rolesScopeGranted = scopes.includes(CORP_ROLES_SCOPE);
      const standing = corpStanding({
        rolesScopeGranted,
        roles: rolesById.get(String(id)) ?? null,
        grantedScopes: scopes,
      });
      if (standing) standings.set(id, standing);
    }
    return standings;
  }, [scopesById, rolesById]);
}
