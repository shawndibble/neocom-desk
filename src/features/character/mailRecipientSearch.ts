/**
 * Name search for Forward's recipient picker. Reuses `BuildLocationPicker`'s
 * own `GET /characters/{id}/search` endpoint with the `character` category
 * instead of stations/structures — same base-grant scope, no new lookup.
 */
import { getCharacterSearch } from '@/esi/endpoints';
import { resolveNames } from './names';

/** ESI's own floor. Below it the endpoint 400s, so it is never called. */
export const MIN_RECIPIENT_SEARCH_LENGTH = 3;

/** One request is one round of typing; more than this is more names than a picker should show at once. */
const MAX_RESULTS = 15;

export interface RecipientSearchHit {
  characterId: number;
  name: string;
}

export async function searchMailRecipients(
  characterId: number,
  query: string,
  signal?: AbortSignal
): Promise<RecipientSearchHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return [];

  const hits = (
    await getCharacterSearch(characterId, ['character'], trimmed, { signal })
  ).data?.character?.slice(0, MAX_RESULTS);
  if (!hits || hits.length === 0) return [];

  const names = await resolveNames(hits);
  return hits
    .map((id): RecipientSearchHit | null => {
      const name = names.get(id);
      return name === undefined ? null : { characterId: id, name };
    })
    .filter((hit): hit is RecipientSearchHit => hit !== null);
}

/** The kinds of recipient ESI's search can find; mailing lists are joined, never searched. */
export const SEARCHABLE_RECIPIENT_TYPES = ['character', 'corporation', 'alliance'] as const;
export type SearchableRecipientType = (typeof SEARCHABLE_RECIPIENT_TYPES)[number];

export interface TypedRecipientHit {
  id: number;
  type: SearchableRecipientType;
  name: string;
}

/**
 * New Mail's search: characters, corporations and alliances in one request.
 * Needs the same `esi-search.search_structures.v1` scope as the character-only
 * search above; a Character without it gets a 403 the caller surfaces.
 */
export async function searchTypedMailRecipients(
  characterId: number,
  query: string,
  signal?: AbortSignal
): Promise<TypedRecipientHit[]> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_RECIPIENT_SEARCH_LENGTH) return [];

  const result = (
    await getCharacterSearch(characterId, SEARCHABLE_RECIPIENT_TYPES, trimmed, { signal })
  ).data;
  const found = SEARCHABLE_RECIPIENT_TYPES.flatMap((type) =>
    (result?.[type] ?? []).slice(0, MAX_RESULTS).map((id) => ({ id, type }))
  );
  if (found.length === 0) return [];

  const names = await resolveNames(found.map((f) => f.id));
  return found.flatMap((f) => {
    const name = names.get(f.id);
    return name === undefined ? [] : [{ ...f, name }];
  });
}
