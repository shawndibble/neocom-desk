/**
 * Name search for Forward's recipient picker (mail-reply-and-forward
 * decision, docs/context/decisions/): search-plus-contacts, not
 * contacts-only. `GET /characters/{id}/search` is the same base-grant
 * endpoint `BuildLocationPicker` already uses for stations/structures
 * (`esi-search.search_structures.v1`, in the base grant) — this just asks it
 * for the `character` category instead, and resolves each hit's name the
 * same way the rest of Mail already does (`resolveNames`), rather than a
 * second lookup mechanism.
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
