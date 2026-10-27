/** Fetch + cache layer for the Contacts view. */
import {
  getCharacterContactLabels,
  getCharacterContacts,
  type CharacterContact,
} from '@/esi/endpoints';
import {
  conditionalPagedFetch,
  conditionalFetch,
  loadPaginatedWithCacheStatus,
  loadWithCacheStatus,
  type StatusResult,
} from '@/esi/cache';

const KEY = 'contacts';

/**
 * All contacts (every page). ESI or cache, with the auth-failure state
 * exposed so the view can offer a re-login instead of a silent empty state
 * when the contacts scope was revoked. `truncated` on the cached result
 * means pages were missing.
 */
export function loadContacts(characterId: number): Promise<StatusResult<CharacterContact[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterContacts(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

const LABELS_KEY = 'contactLabels';

/**
 * The character's in-game contact labels, id to name. Never throws and never
 * asks for a re-login: the labels only decorate the contacts table, so a
 * failed request or a missing scope is the same as having no labels.
 */
export async function loadContactLabels(characterId: number): Promise<Map<number, string>> {
  try {
    const { fetchLive, conditional } = conditionalFetch((options) =>
      getCharacterContactLabels(characterId, options)
    );
    const { cached } = await loadWithCacheStatus(characterId, LABELS_KEY, fetchLive, {
      conditional,
    });
    return new Map((cached?.data ?? []).map((label) => [label.label_id, label.label_name]));
  } catch {
    return new Map();
  }
}

/** A contact's label names in the character's label order; ids with no known label are dropped. */
export function contactLabelNames(
  contact: Pick<CharacterContact, 'label_ids'>,
  labels: ReadonlyMap<number, string>
): string[] {
  return (contact.label_ids ?? []).flatMap((id) => {
    const name = labels.get(id);
    return name === undefined ? [] : [name];
  });
}
