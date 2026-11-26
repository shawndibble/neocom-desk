import { loadContactLabels, loadContacts } from '@/features/character/contacts';
import {
  loadContactsAcrossCharacters,
  type CharacterContactList,
} from '@/features/character/contactsAcrossCharacters';
import type { CachedResult } from '@/esi/cache';
import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import { resolveNames } from '@/features/character/names';
import { resolveAffiliations } from '@/features/character/affiliations';
import { type OwnAffiliation } from '@/features/character/contactAffiliation';
import { type RouteSnapshotSignal } from '@/lib/useRouteSnapshot';

export interface ContactsSnapshot {
  contactsResult: CachedResult<CharacterContact[]> | null;
  contactsNeedsReauth: boolean;
  contactsTruncated: boolean;
  contactNames: Map<number, string>;
  contactLabels: Map<number, string>;
  affiliations: Map<number, CharacterAffiliation>;
  ownAffiliation: OwnAffiliation;
  acrossLists: CharacterContactList[];
}

export function entityName(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

export const NO_LABELS: ReadonlyMap<number, string> = new Map();
export const NO_OWN_AFFILIATION: OwnAffiliation = {};
export const NO_LISTS: readonly CharacterContactList[] = [];

export async function loadContactsSnapshot(
  characterId: number,
  signal: RouteSnapshotSignal
): Promise<ContactsSnapshot> {
  const { cached: contactsResult, needsReauth: contactsNeedsReauth } =
    await loadContacts(characterId);
  const contactsTruncated = contactsResult?.truncated ?? false;
  const contacts = signal.cancelled ? [] : (contactsResult?.data ?? []);

  const playerIds = contacts.filter((c) => c.contact_type === 'character').map((c) => c.contact_id);
  const affiliations = await resolveAffiliations(
    playerIds.length === 0 ? [] : [...playerIds, characterId]
  );
  const ownAffiliation: OwnAffiliation = {
    corporationId: affiliations.get(characterId)?.corporation_id,
    allianceId: affiliations.get(characterId)?.alliance_id,
  };

  const affiliationIds = [...affiliations.values()].flatMap((a) =>
    a.alliance_id === undefined ? [a.corporation_id] : [a.corporation_id, a.alliance_id]
  );
  const acrossLists = await loadContactsAcrossCharacters();
  const contactLabels = await loadContactLabels(characterId);
  const contactNames = await resolveNames([
    ...contacts.map((c) => c.contact_id),
    ...affiliationIds,
    ...acrossLists.flatMap((list) => list.contacts.map((c) => c.contact_id)),
  ]);
  return {
    contactsResult,
    contactsNeedsReauth,
    contactsTruncated,
    contactNames,
    contactLabels,
    affiliations,
    ownAffiliation,
    acrossLists,
  };
}
