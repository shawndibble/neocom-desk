import { useEffect, useMemo, useState } from 'react';
import { getCorporationPublicInfo, postCharactersAffiliation } from '@/esi/endpoints';
import { useCharacters } from '@/features/character/useCharacters';
import { reportFailure } from '@/observability/reportFailure';
import type { AddCorpsCandidate } from '@/engine/corpTaxBook/addCorpsRun';

async function loadCorporationLive(corporationId: number) {
  return (await getCorporationPublicInfo(corporationId)).data ?? null;
}

export async function findOwnCeoCorps(
  characters: readonly { characterId: number; name: string }[],
  excludeCorporationId: number | undefined
): Promise<AddCorpsCandidate[]> {
  const rows = await postCharactersAffiliation(characters.map((c) => c.characterId));
  const corpOf = new Map(rows.map((r) => [r.character_id, r.corporation_id]));
  const corpIds = new Set(corpOf.values());
  if (excludeCorporationId !== undefined) corpIds.delete(excludeCorporationId);
  const byId = new Map(characters.map((c) => [c.characterId, c.name]));
  const found = await Promise.all(
    [...corpIds].map(async (corporationId): Promise<AddCorpsCandidate | null> => {
      const info = await loadCorporationLive(corporationId).catch(() => null);
      if (!info || !byId.has(info.ceo_id)) return null;
      if (corpOf.get(info.ceo_id) !== corporationId) return null;
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

export type PairingCheck = 'ok' | 'stale' | 'unreachable';

export async function verifyOwnCeoCorp(candidate: AddCorpsCandidate): Promise<PairingCheck> {
  try {
    const [rows, info] = await Promise.all([
      postCharactersAffiliation([candidate.ceoCharacterId]),
      loadCorporationLive(candidate.corporationId),
    ]);
    const corporationId = rows.find(
      (r) => r.character_id === candidate.ceoCharacterId
    )?.corporation_id;
    return corporationId === candidate.corporationId && info?.ceo_id === candidate.ceoCharacterId
      ? 'ok'
      : 'stale';
  } catch (e) {
    reportFailure('esi', e);
    return 'unreachable';
  }
}

export interface OwnCeoCorps {
  corps: AddCorpsCandidate[];
  loading: boolean;
  error: boolean;
}

export function useOwnCeoCorps(excludeCorporationId?: number, enabled = true): OwnCeoCorps {
  const characters = useCharacters();
  const lookup = useMemo(
    () =>
      `${excludeCorporationId ?? ''}:${characters
        .map((c) => c.characterId)
        .sort((a, b) => a - b)
        .join(',')}`,
    [characters, excludeCorporationId]
  );
  const [done, setDone] = useState<{
    lookup: string;
    corps: AddCorpsCandidate[];
    error: boolean;
  }>();

  useEffect(() => {
    if (!enabled || characters.length === 0) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup, enabled]);

  if (!enabled || characters.length === 0) return { corps: [], loading: false, error: false };
  if (done?.lookup !== lookup) return { corps: done?.corps ?? [], loading: true, error: false };
  return { corps: done.corps, loading: false, error: done.error };
}
