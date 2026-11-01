/**
 * The corporations the player is CEO of through a Character on this account:
 * the candidates for "Add my other corps". Public data only (character
 * affiliations, then each corporation's public record), so it asks for no new
 * scope. The CEO changes, so the record is read with a short stale window
 * rather than the day-long static one.
 */
import { useEffect, useMemo, useState } from 'react';
import { getCorporationPublicInfo } from '@/esi/endpoints';
import {
  conditionalFetch,
  GLOBAL_CACHE_CHARACTER_ID,
  loadWithCache,
  STALE_AFTER,
} from '@/esi/cache';
import { resolveAffiliations } from '@/features/character/affiliations';
import { useCharacters } from '@/features/character/useCharacters';
import { reportFailure } from '@/observability/reportFailure';
import type { AddCorpsCandidate } from '@/engine/corpTaxBook/addCorpsRun';

async function loadCorporationRecord(corporationId: number) {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCorporationPublicInfo(corporationId, options)
  );
  // Same cache row as `loadPublicCorporationRecord`, read on a short window.
  const result = await loadWithCache(
    GLOBAL_CACHE_CHARACTER_ID,
    `public-corporation:${corporationId}`,
    fetchLive,
    { staleAfterMs: STALE_AFTER.default, conditional }
  );
  return result?.data ?? null;
}

/** Every distinct corporation whose CEO is one of `characters`, minus `excludeCorporationId`. */
export async function findOwnCeoCorps(
  characters: readonly { characterId: number; name: string }[],
  excludeCorporationId: number | undefined
): Promise<AddCorpsCandidate[]> {
  const affiliations = await resolveAffiliations(characters.map((c) => c.characterId));
  const corpIds = new Set<number>();
  for (const a of affiliations.values()) corpIds.add(a.corporation_id);
  if (excludeCorporationId !== undefined) corpIds.delete(excludeCorporationId);
  const byId = new Map(characters.map((c) => [c.characterId, c.name]));
  const found = await Promise.all(
    [...corpIds].map(async (corporationId): Promise<AddCorpsCandidate | null> => {
      const info = await loadCorporationRecord(corporationId);
      if (!info || !byId.has(info.ceo_id)) return null;
      return {
        corporationId,
        name: info.name,
        ceoCharacterId: info.ceo_id,
        ceoName: byId.get(info.ceo_id)!,
      };
    })
  );
  return found
    .filter((c): c is AddCorpsCandidate => c !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface OwnCeoCorps {
  corps: AddCorpsCandidate[];
  loading: boolean;
  error: boolean;
}

export function useOwnCeoCorps(excludeCorporationId?: number): OwnCeoCorps {
  const characters = useCharacters();
  const lookup = useMemo(
    () =>
      `${excludeCorporationId ?? ''}:${characters
        .map((c) => c.characterId)
        .sort((a, b) => a - b)
        .join(',')}`,
    [characters, excludeCorporationId]
  );
  // The result carries the lookup it answers, so a changed input reads as loading without a reset.
  const [done, setDone] = useState<{
    lookup: string;
    corps: AddCorpsCandidate[];
    error: boolean;
  }>();

  useEffect(() => {
    if (characters.length === 0) return;
    let cancelled = false;
    findOwnCeoCorps(characters, excludeCorporationId)
      .then((corps) => !cancelled && setDone({ lookup, corps, error: false }))
      .catch((e: unknown) => {
        reportFailure('esi', e);
        if (!cancelled) setDone({ lookup, corps: [], error: true });
      });
    return () => {
      cancelled = true;
    };
    // `lookup` stands for `characters`: a live query hands a new array on every write.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);

  if (characters.length === 0) return { corps: [], loading: false, error: false };
  if (done?.lookup !== lookup) return { corps: done?.corps ?? [], loading: true, error: false };
  return { corps: done.corps, loading: false, error: done.error };
}
