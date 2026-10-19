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
  /** 401/403 (or a failed token refresh) means "log in again", not "offline". */
  contactsNeedsReauth: boolean;
  /** Fewer pages came back than ESI advertised — the list below is partial. */
  contactsTruncated: boolean;
  contactNames: Map<number, string>;
  /** The character's in-game contact labels (id to name); empty when none or unreadable. */
  contactLabels: Map<number, string>;
  /** Player contacts only, plus the signed-in character — see `loadContactsSnapshot`. */
  affiliations: Map<number, CharacterAffiliation>;
  /** The signed-in character's own corp and alliance, for the "yours" badges. */
  ownAffiliation: OwnAffiliation;
  /**
   * Every Character's contacts as last cached on this device, for the second
   * tab. Cache-only — a Dexie read, no network — so the ordinary visit pays
   * nothing for it; the tab offers a live fetch of its own.
   */
  acrossLists: CharacterContactList[];
}

/** What the table prints for an id whose name has not resolved — searchable, per `contactsFilter`. */
export function entityName(names: ReadonlyMap<number, string>, id: number): string {
  return names.get(id) ?? `#${id}`;
}

/** Stable identities, so a fallback doesn't invalidate the column memo every render. */
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
  // Already superseded: skip the lookups, their results would be discarded.
  const contacts = signal.cancelled ? [] : (contactsResult?.data ?? []);

  // The character's own affiliation rides along in the same request as their
  // contacts', so "is this pilot in my corp" costs no extra round trip.
  const playerIds = contacts.filter((c) => c.contact_type === 'character').map((c) => c.contact_id);
  const affiliations = await resolveAffiliations(
    playerIds.length === 0 ? [] : [...playerIds, characterId]
  );
  const ownAffiliation: OwnAffiliation = {
    corporationId: affiliations.get(characterId)?.corporation_id,
    allianceId: affiliations.get(characterId)?.alliance_id,
  };

  // Names come second because the corps and alliances to name are only known
  // once the affiliations are back. `resolveNames` is cache-first, so on every
  // visit after the first this costs no request at all.
  const affiliationIds = [...affiliations.values()].flatMap((a) =>
    a.alliance_id === undefined ? [a.corporation_id] : [a.corporation_id, a.alliance_id]
  );
  // The second tab lists contacts this character may not hold at all, so its
  // ids go into the same batch — otherwise every row belonging only to an alt
  // would print as `#id`.
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
