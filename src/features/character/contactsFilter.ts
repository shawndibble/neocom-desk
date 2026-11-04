/**
 * The Contacts filter bar's state: free text, contact type, standing category.
 *
 * Same shape as `ContractsFilter` — a pure predicate over the fetched list,
 * with the route owning the state — except that type and standing are *sets*
 * with every member selected by default. A contact list is read as "hide the
 * neutrals", not "show me only alliances", so the empty filter is everything
 * on rather than everything off.
 */
import type { CharacterContact } from '@/esi/endpoints';
import { isNpcCharacterId, isNpcCorporationId } from '@/esi/entityIds';
import type { PublicInfoKind } from '@/stores/publicInfoModal';
import type { Translate } from '@/lib/translate';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';

export type ContactType = CharacterContact['contact_type'];
export type StandingCategory = 'good' | 'neutral' | 'bad';

/** Best to worst, which is the order the chips read in. */
export const STANDING_CATEGORIES: readonly StandingCategory[] = ['good', 'neutral', 'bad'];

/**
 * ESI's `contact_type` verbatim was what the table used to print. "Player" is
 * what a pilot calls a character contact (a "character" is also a thing corps
 * and alliances are made of), and "Corp" is how the name is written everywhere
 * in game — both shorter than what they replace. Shared with `contactsCsv.ts`
 * so the export prints the same words the table does.
 */
export const CONTACT_TYPE_KEY: Record<ContactType, string> = {
  character: 'contacts.typeCharacter',
  corporation: 'contacts.typeCorporation',
  alliance: 'contacts.typeAlliance',
  faction: 'contacts.typeFaction',
};

/**
 * What the type chips and the Type column sort a contact into: ESI's type,
 * except that an NPC — an agent or an NPC corporation, by CCP's id blocks —
 * is its own kind. A pilot reading their list wants players and the agents
 * they run missions for apart, and ESI files both as `character`.
 */
export type ContactKind = ContactType | 'npc';

/** The chips' order: people first, NPCs straight after the players they would be mistaken for. */
export const ALL_CONTACT_KINDS: readonly ContactKind[] = [
  'character',
  'npc',
  'corporation',
  'alliance',
  'faction',
];

/** The chip labels. */
export const CONTACT_KIND_KEY: Record<ContactKind, string> = {
  ...CONTACT_TYPE_KEY,
  npc: 'contacts.typeNpc',
};

/** Only the identity is read, so a merged Across-Characters row can be sorted too. */
export type ContactIdentity = Pick<CharacterContact, 'contact_id' | 'contact_type'>;

export function contactKind(contact: ContactIdentity): ContactKind {
  if (contact.contact_type === 'character' && isNpcCharacterId(contact.contact_id)) return 'npc';
  if (contact.contact_type === 'corporation' && isNpcCorporationId(contact.contact_id)) {
    return 'npc';
  }
  return contact.contact_type;
}

/**
 * Which Show Info tab a contact opens on — the row click and the row menu's
 * entry alike. The modal now has a faction view (Standings opens it), but a
 * faction contact here opens nothing: the Contacts page has no use for it yet.
 */
export function contactPublicInfoKind(contact: ContactIdentity): PublicInfoKind | null {
  return contact.contact_type === 'faction' ? null : contact.contact_type;
}

/** The Type column's word: "NPC agent" or "NPC corp" for an NPC, else the chip's. */
export function contactTypeLabelKey(contact: ContactIdentity): string {
  if (contactKind(contact) !== 'npc') return CONTACT_TYPE_KEY[contact.contact_type];
  return contact.contact_type === 'character'
    ? 'contacts.typeNpcAgent'
    : 'contacts.typeNpcCorporation';
}

/** Zero is its own category, not a rounding of either side: it is what "no opinion" looks like. */
export function standingCategory(standing: number): StandingCategory {
  if (standing > 0) return 'good';
  if (standing < 0) return 'bad';
  return 'neutral';
}

export interface ContactsFilter {
  /** Matched against the resolved name, falling back to the raw contact id. */
  text: string;
  types: ReadonlySet<ContactKind>;
  standings: ReadonlySet<StandingCategory>;
}

export const EMPTY_CONTACTS_FILTER: ContactsFilter = {
  text: '',
  types: new Set(ALL_CONTACT_KINDS),
  standings: new Set(STANDING_CATEGORIES),
};

/**
 * Every criterion is ANDed. Text matches the name the table prints — including
 * the `#id` fallback, so a contact whose name has not resolved is still
 * findable by the only string on screen.
 */
export function filterContacts(
  contacts: readonly CharacterContact[],
  filter: ContactsFilter,
  names: ReadonlyMap<number, string>
): CharacterContact[] {
  const text = filter.text.trim().toLowerCase();
  return contacts.filter((contact) => {
    if (!filter.types.has(contactKind(contact))) return false;
    if (!filter.standings.has(standingCategory(contact.standing))) return false;
    if (text !== '') {
      const name = names.get(contact.contact_id) ?? String(contact.contact_id);
      if (!name.toLowerCase().includes(text) && !String(contact.contact_id).includes(text)) {
        return false;
      }
    }
    return true;
  });
}

/**
 * How many criteria are narrowing the list, for the filter sheet's badge. A
 * set counts once however many members it dropped: the badge answers "is this
 * list filtered", not "by how much".
 */
export function activeContactsFilterCount(filter: ContactsFilter): number {
  let count = 0;
  if (filter.text.trim() !== '') count += 1;
  if (filter.types.size !== ALL_CONTACT_KINDS.length) count += 1;
  if (filter.standings.size !== STANDING_CATEGORIES.length) count += 1;
  return count;
}

/** The standing chips' labels, best to worst. */
export const STANDING_FILTER_KEY: Record<StandingCategory, string> = {
  good: 'contacts.filterGood',
  neutral: 'contacts.filterNeutral',
  bad: 'contacts.filterBad',
};

/**
 * The narrowed groups as `FilterBar` pills, Type then Standing. Unlike
 * `activeContactsFilterCount` the search text is not one: the box shows it.
 * Generic so the Across tab's bar value, which adds its own chip, keeps its
 * extra field through each `clear`.
 */
export function activeContactsFilters<F extends ContactsFilter>(
  filter: F,
  t: Translate
): ActiveFilter<F>[] {
  const picked = (names: string[]) =>
    names.length === 0 ? t('filters.none') : summarizeFilterValues(names, t);
  const active: ActiveFilter<F>[] = [];
  if (filter.types.size !== ALL_CONTACT_KINDS.length)
    active.push({
      label: t('contacts.typeFilterLabel'),
      value: picked(
        ALL_CONTACT_KINDS.filter((kind) => filter.types.has(kind)).map((kind) =>
          t(CONTACT_KIND_KEY[kind])
        )
      ),
      clear: (value) => ({ ...value, types: EMPTY_CONTACTS_FILTER.types }),
    });
  if (filter.standings.size !== STANDING_CATEGORIES.length)
    active.push({
      label: t('contacts.standingFilterLabel'),
      value: picked(
        STANDING_CATEGORIES.filter((category) => filter.standings.has(category)).map((category) =>
          t(STANDING_FILTER_KEY[category])
        )
      ),
      clear: (value) => ({ ...value, standings: EMPTY_CONTACTS_FILTER.standings }),
    });
  return active;
}

/** Every category, zeros included — a chip reading "Bad 0" is information. */
export function contactCountsByStanding(
  contacts: readonly CharacterContact[]
): Record<StandingCategory, number> {
  const counts: Record<StandingCategory, number> = { good: 0, neutral: 0, bad: 0 };
  for (const contact of contacts) counts[standingCategory(contact.standing)] += 1;
  return counts;
}

/** Every kind, zeros included, for the same reason. */
export function contactCountsByKind(
  contacts: readonly CharacterContact[]
): Record<ContactKind, number> {
  const counts: Record<ContactKind, number> = {
    character: 0,
    npc: 0,
    corporation: 0,
    alliance: 0,
    faction: 0,
  };
  for (const contact of contacts) counts[contactKind(contact)] += 1;
  return counts;
}
