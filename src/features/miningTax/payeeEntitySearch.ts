import { getCharacterSearch, postUniverseIds } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { searchZkillEntities } from '@/lib/zkillboard';
import type { PayeeEntityKind } from './payees';

export const MIN_PAYEE_SEARCH_LENGTH = 3;

const MAX_RESULTS = 15;

export interface PayeeEntityMatch {
  id: number;
  name: string;
  kind: PayeeEntityKind;
}

const KIND_ORDER: readonly PayeeEntityKind[] = ['corporation', 'character', 'alliance'];

export async function searchPayeeEntities(
  characterId: number,
  query: string,
  signal?: AbortSignal
): Promise<PayeeEntityMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_PAYEE_SEARCH_LENGTH) return [];

  const data = (
    await getCharacterSearch(characterId, ['character', 'corporation', 'alliance'], trimmed, {
      signal,
    })
  ).data;
  if (!data) return [];

  const hits: { id: number; kind: PayeeEntityKind }[] = [];
  for (const kind of KIND_ORDER) {
    for (const id of data[kind] ?? []) hits.push({ id, kind });
  }
  const capped = hits.slice(0, MAX_RESULTS);
  if (capped.length === 0) return [];

  const names = await resolveNames(capped.map((h) => h.id));
  return capped.flatMap((hit) => {
    const name = names.get(hit.id);
    return name === undefined ? [] : [{ ...hit, name }];
  });
}

export async function resolvePayeeName(
  name: string,
  signal?: AbortSignal
): Promise<PayeeEntityMatch[]> {
  const trimmed = name.trim();
  if (trimmed === '') return [];
  const ids = await postUniverseIds([trimmed], { signal });
  const buckets: Record<PayeeEntityKind, { id: number; name: string }[] | undefined> = {
    corporation: ids.corporations,
    character: ids.characters,
    alliance: ids.alliances,
  };
  return KIND_ORDER.flatMap((kind) => (buckets[kind] ?? []).map((e) => ({ ...e, kind })));
}

export async function searchPayeeEntitiesPublic(
  query: string,
  signal?: AbortSignal
): Promise<PayeeEntityMatch[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_PAYEE_SEARCH_LENGTH) return [];
  const [exact, partial] = await Promise.all([
    resolvePayeeName(trimmed, signal).catch((): PayeeEntityMatch[] => []),
    searchZkillEntities(trimmed),
  ]);
  const byId = new Map<number, PayeeEntityMatch>();
  for (const match of [...exact, ...partial]) if (!byId.has(match.id)) byId.set(match.id, match);
  return [...byId.values()].slice(0, MAX_RESULTS);
}
