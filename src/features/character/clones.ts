import { getCharacterClones, type CharacterClones } from '@/esi/endpoints';
import { loadTypeDetail } from '@/features/skills/typeDetail';
import { typeDescription } from '@/features/skills/typeDisplay';
import { extractAttributeBonuses, extractImplantSlot } from '@/features/skills/dogma';
import type { Attributes } from '@/engine/types';
import { conditionalFetch, loadWithCacheStatus, type StatusResult } from '@/esi/cache';

export const KEY = 'clones';

export function loadCharacterClones(characterId: number): Promise<StatusResult<CharacterClones>> {
  const { fetchLive, conditional } = conditionalFetch((options) =>
    getCharacterClones(characterId, options)
  );
  return loadWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

export interface ImplantDetail {
  description?: string;
  slot?: number;
  bonuses: Partial<Attributes>;
}

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
