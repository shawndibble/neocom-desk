/**
 * Each Character's corporation's open manufacture projects, read once when
 * Opportunities opens (issue #4786): no polling, and `corpProjectsData`'s cache
 * answers a revisit. Only a Character that holds the Corporation projects
 * Permission and has a corporation is read, so the answer doubles as the hide
 * rule: no entries, no Corp projects view.
 */
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCharacterIdsWithScopes } from '@/app/characterIdsWithScopes';
import { db } from '@/db';
import type { CorpManufactureProject } from '@/engine/corpProjects/corpProjects';
import { scopesForGroup } from '@/esi/scopes';
import { loadCorpManufactureProjects } from './corpProjectsData';

export interface CharacterCorpProjects {
  characterId: number;
  corporationId: number;
  projects: CorpManufactureProject[];
}

export interface CorpProjectsState {
  /** Characters with at least one open manufacture project, in `characterIds` order. */
  entries: CharacterCorpProjects[];
  /** True until the first read settles (or the permission lookup does). */
  loading: boolean;
}

const PROJECT_SCOPES = scopesForGroup('corpProjects');

export function useCorpProjects(characterIds: readonly number[]): CorpProjectsState {
  const granted = useCharacterIdsWithScopes(PROJECT_SCOPES, characterIds);
  const idsKey = characterIds.join(',');
  const corporations = useLiveQuery(async () => {
    const records = await db.characters.bulkGet([...characterIds]);
    return new Map(
      records.flatMap((record) =>
        record?.corporationId === undefined ? [] : [[record.characterId, record.corporationId]]
      )
    );
  }, [idsKey]);

  const eligible =
    granted === undefined || corporations === undefined
      ? undefined
      : characterIds.flatMap((characterId) => {
          const corporationId = corporations.get(characterId);
          return granted.has(characterId) && corporationId !== undefined
            ? [{ characterId, corporationId }]
            : [];
        });
  const eligibleKey = eligible?.map((e) => `${e.characterId}:${e.corporationId}`).join(',');

  const [state, setState] = useState<{ key: string; entries: CharacterCorpProjects[] } | null>(
    null
  );
  useEffect(() => {
    if (eligible === undefined || eligibleKey === undefined) return;
    let cancelled = false;
    void Promise.all(
      eligible.map(async ({ characterId, corporationId }) => {
        const { cached } = await loadCorpManufactureProjects(characterId, corporationId);
        const projects = cached?.data ?? [];
        return projects.length > 0 ? [{ characterId, corporationId, projects }] : [];
      })
    ).then((groups) => {
      if (!cancelled) setState({ key: eligibleKey, entries: groups.flat() });
    });
    return () => {
      cancelled = true;
    };
    // `eligibleKey` is `eligible` by value; the array itself is rebuilt every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleKey]);

  const loading = eligibleKey === undefined || state?.key !== eligibleKey;
  return { entries: loading ? [] : state.entries, loading };
}
