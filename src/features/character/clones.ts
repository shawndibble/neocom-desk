/** Fetch + cache layer for the Clones view. */
import { getCharacterClones, type CharacterClones } from '@/esi/endpoints';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { typeDescription } from '@/features/skills/typeDisplay';
import { extractAttributeBonuses, extractImplantSlot } from '@/features/skills/dogma';
import type { Attributes } from '@/engine/types';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';

export const KEY = 'clones';

/**
 * Jump clones, home location and last-jump timestamp. ESI or cache, with the
 * auth-failure state exposed so the view can offer a re-login instead of a
 * silent empty state when the clones scope was revoked.
 */
export function loadCharacterClones(characterId: number): Promise<StatusResult<CharacterClones>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterClones(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

/** What the clone cards show beside an implant's name. */
export interface ImplantDetail {
  /** Markup-stripped; absent when the type has none, so the name gets no empty tooltip. */
  description?: string;
  /** Implant slot 1–10; absent when the type has none. */
  slot?: number;
  /** Non-zero attribute bonuses (the learning implants). */
  bonuses: Partial<Attributes>;
}

/**
 * Keyed by typeID. A failed lookup leaves the id absent, so the caller renders
 * the bare name. Baked shard first; the ESI fallback retries once, and a
 * still-failing id never rejects the whole snapshot.
 */
export async function loadImplantDetails(
  typeIds: readonly number[]
): Promise<Map<number, ImplantDetail>> {
  const unique = [...new Set(typeIds)];
  const types = await Promise.all(unique.map((id) => loadTypeDetail(id, { retry: true })));
  const map = new Map<number, ImplantDetail>();
  unique.forEach((id, i) => {
    const data = types[i];
    if (!data) return;
    const description = typeDescription(data.description);
    const slot = extractImplantSlot(data.dogma_attributes);
    map.set(id, {
      ...(description ? { description } : {}),
      ...(slot !== undefined ? { slot } : {}),
      bonuses: extractAttributeBonuses(data.dogma_attributes),
    });
  });
  return map;
}
