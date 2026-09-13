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

export type ContactType = CharacterContact['contact_type'];
export type StandingCategory = 'good' | 'neutral' | 'bad';

/** Best to worst, which is the order the chips read in. */
export const STANDING_CATEGORIES: readonly StandingCategory[] = ['good', 'neutral', 'bad'];

/** ESI's own order, and the one `CONTACT_TYPE_KEY` lists. */
export const ALL_CONTACT_TYPES: readonly ContactType[] = [
  'character',
  'corporation',
  'alliance',
  'faction',
];

/** Zero is its own category, not a rounding of either side: it is what "no opinion" looks like. */
export function standingCategory(standing: number): StandingCategory {
  if (standing > 0) return 'good';
  if (standing < 0) return 'bad';
  return 'neutral';
}

export interface ContactsFilter {
  /** Matched against the resolved name, falling back to the raw contact id. */
  text: string;
  types: ReadonlySet<ContactType>;
  standings: ReadonlySet<StandingCategory>;
}

export const EMPTY_CONTACTS_FILTER: ContactsFilter = {
  text: '',
  types: new Set(ALL_CONTACT_TYPES),
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
    if (!filter.types.has(contact.contact_type)) return false;
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
  if (filter.types.size !== ALL_CONTACT_TYPES.length) count += 1;
  if (filter.standings.size !== STANDING_CATEGORIES.length) count += 1;
  return count;
}

/** Every category, zeros included — a chip reading "Bad 0" is information. */
export function contactCountsByStanding(
  contacts: readonly CharacterContact[]
): Record<StandingCategory, number> {
  const counts: Record<StandingCategory, number> = { good: 0, neutral: 0, bad: 0 };
  for (const contact of contacts) counts[standingCategory(contact.standing)] += 1;
  return counts;
}

/** Every type, zeros included, for the same reason. */
export function contactCountsByType(
  contacts: readonly CharacterContact[]
): Record<ContactType, number> {
  const counts: Record<ContactType, number> = {
    character: 0,
    corporation: 0,
    alliance: 0,
    faction: 0,
  };
  for (const contact of contacts) counts[contact.contact_type] += 1;
  return counts;
}
