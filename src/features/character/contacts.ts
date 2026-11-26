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

export function loadContacts(characterId: number): Promise<StatusResult<CharacterContact[]>> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getCharacterContacts(characterId, options)
  );
  return loadPaginatedWithCacheStatus(characterId, KEY, fetchLive, { conditional });
}

const LABELS_KEY = 'contactLabels';

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

export function contactLabelNames(
  contact: Pick<CharacterContact, 'label_ids'>,
  labels: ReadonlyMap<number, string>
): string[] {
  return (contact.label_ids ?? []).flatMap((id) => {
    const name = labels.get(id);
    return name === undefined ? [] : [name];
  });
}
