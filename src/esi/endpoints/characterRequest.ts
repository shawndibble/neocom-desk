import { esiFetch } from '../client';
import type { EsiResult } from '../client';
import { fetchAllPagesStatus } from '../paginated';
import type { PaginatedResult } from '../paginated';
import { ESI_REGISTRY } from '../registry';
import type { EsiEndpointId } from '../registry';
import type { EndpointOptions } from './options';

/** Registry endpoints whose route is `/characters/{character_id}…` with no other path parameter. */
type CharacterRoute<K extends EsiEndpointId> = (typeof ESI_REGISTRY)[K]['route'];
export type CharacterEndpointId = {
  [K in EsiEndpointId]: CharacterRoute<K> extends `${string}{character_id}${infer Rest}`
    ? Rest extends `${string}{${string}`
      ? never
      : K
    : never;
}[EsiEndpointId];

/** The registry route with `{character_id}` filled in — path, scope and id live in `registry.ts` only. */
function characterPath(id: CharacterEndpointId, characterId: number): string {
  return ESI_REGISTRY[id].route.replace('{character_id}', String(characterId));
}

/** Authenticated GET of a character-scoped endpoint; `endpointId` is the registry key. */
export function characterGet<T>(
  id: CharacterEndpointId,
  characterId: number,
  options: EndpointOptions
): Promise<EsiResult<T>> {
  return esiFetch<T>(characterPath(id, characterId), { ...options, characterId, endpointId: id });
}

/** `characterGet` for X-Pages endpoints; see `fetchAllPagesStatus`. */
export function characterPages<T>(
  id: CharacterEndpointId,
  characterId: number,
  options: EndpointOptions
): Promise<PaginatedResult<T>> {
  return fetchAllPagesStatus<T>(characterPath(id, characterId), {
    ...options,
    characterId,
    endpointId: id,
  });
}
