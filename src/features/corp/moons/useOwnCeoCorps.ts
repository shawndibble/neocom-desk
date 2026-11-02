/**
 * The corporations the player is CEO of through a Character on this account:
 * the candidates for "Add my other corps". Public data only (character
 * affiliations, then each corporation's public record), so it asks for no new
 * scope. Everything is read live and cross-checked (see `findOwnCeoCorps`).
 */
import { useEffect, useMemo, useState } from 'react';
import { getCorporationPublicInfo, postCharactersAffiliation } from '@/esi/endpoints';
import { useCharacters } from '@/features/character/useCharacters';
import { reportFailure } from '@/observability/reportFailure';
import type { AddCorpsCandidate } from '@/engine/corpTaxBook/addCorpsRun';

/**
 * Both reads are live, never the cached rows: a corporation changes CEO and a Character
 * changes corporation, and a cached pairing that is a day old is offered, signed in for,
 * then refused by the server (which reads ESI fresh) as "another corporation".
 */
async function loadCorporationLive(corporationId: number) {
  return (await getCorporationPublicInfo(corporationId)).data ?? null;
}

/**
 * Every distinct corporation whose CEO is one of `characters` and is, right now, in that
 * corporation, minus `excludeCorporationId`. A pairing ESI no longer agrees on is dropped.
 */
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
      const info = await loadCorporationLive(corporationId);
      if (!info || !byId.has(info.ceo_id)) return null;
      // The CEO must be in the corporation by the same fresh read, or the pairing is stale.
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

/**
 * Whether `candidate` still holds: its CEO Character is in the corporation and the
 * corporation still names that Character CEO. Read live just before a login is sent to
 * EVE, so a corporation that changed since the list was built is never signed in for.
 * False when ESI cannot answer.
 */
export async function verifyOwnCeoCorp(candidate: AddCorpsCandidate): Promise<boolean> {
  try {
    const [rows, info] = await Promise.all([
      postCharactersAffiliation([candidate.ceoCharacterId]),
      loadCorporationLive(candidate.corporationId),
    ]);
    const corporationId = rows.find(
      (r) => r.character_id === candidate.ceoCharacterId
    )?.corporation_id;
    return corporationId === candidate.corporationId && info?.ceo_id === candidate.ceoCharacterId;
  } catch {
    return false;
  }
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
