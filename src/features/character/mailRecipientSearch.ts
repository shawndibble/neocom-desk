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
