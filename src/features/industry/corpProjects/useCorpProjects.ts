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
  entries: CharacterCorpProjects[];
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
    if (eligibleKey === undefined) return;
    let cancelled = false;
    const pairs =
      eligibleKey === '' ? [] : eligibleKey.split(',').map((pair) => pair.split(':').map(Number));
    void Promise.all(
      pairs.map(async ([characterId, corporationId]) => {
        try {
          const { cached } = await loadCorpManufactureProjects(characterId!, corporationId!);
          const projects = cached?.data ?? [];
          return projects.length > 0
            ? [{ characterId: characterId!, corporationId: corporationId!, projects }]
            : [];
        } catch {
          return [];
        }
      })
    ).then((groups) => {
      if (!cancelled) setState({ key: eligibleKey, entries: groups.flat() });
    });
    return () => {
      cancelled = true;
    };
  }, [eligibleKey]);

  const loading = eligibleKey === undefined || state?.key !== eligibleKey;
  return { entries: loading ? [] : state.entries, loading };
}
