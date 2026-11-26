import type { CharacterContact } from '@/esi/endpoints';
import { isNpcCharacterId, isNpcCorporationId } from '@/esi/entityIds';
import type { PublicInfoKind } from '@/stores/publicInfoModal';
import type { Translate } from '@/lib/translate';
import { summarizeFilterValues, type ActiveFilter } from '@/components/ui';

export type ContactType = CharacterContact['contact_type'];
export type StandingCategory = 'good' | 'neutral' | 'bad';

export const STANDING_CATEGORIES: readonly StandingCategory[] = ['good', 'neutral', 'bad'];

export const CONTACT_TYPE_KEY: Record<ContactType, string> = {
  character: 'contacts.typeCharacter',
  corporation: 'contacts.typeCorporation',
  alliance: 'contacts.typeAlliance',
  faction: 'contacts.typeFaction',
};

export type ContactKind = ContactType | 'npc';

export const ALL_CONTACT_KINDS: readonly ContactKind[] = [
  'character',
  'npc',
  'corporation',
  'alliance',
  'faction',
];

export const CONTACT_KIND_KEY: Record<ContactKind, string> = {
  ...CONTACT_TYPE_KEY,
  npc: 'contacts.typeNpc',
};

export type ContactIdentity = Pick<CharacterContact, 'contact_id' | 'contact_type'>;

export function contactKind(contact: ContactIdentity): ContactKind {
  if (contact.contact_type === 'character' && isNpcCharacterId(contact.contact_id)) return 'npc';
  if (contact.contact_type === 'corporation' && isNpcCorporationId(contact.contact_id)) {
    return 'npc';
  }
  return contact.contact_type;
}

export function contactPublicInfoKind(contact: ContactIdentity): PublicInfoKind | null {
  return contact.contact_type === 'faction' ? null : contact.contact_type;
}

export function contactTypeLabelKey(contact: ContactIdentity): string {
  if (contactKind(contact) !== 'npc') return CONTACT_TYPE_KEY[contact.contact_type];
  return contact.contact_type === 'character'
    ? 'contacts.typeNpcAgent'
    : 'contacts.typeNpcCorporation';
}

export function standingCategory(standing: number): StandingCategory {
  if (standing > 0) return 'good';
  if (standing < 0) return 'bad';
  return 'neutral';
}

export interface ContactsFilter {
  text: string;
  types: ReadonlySet<ContactKind>;
  standings: ReadonlySet<StandingCategory>;
}

export const EMPTY_CONTACTS_FILTER: ContactsFilter = {
  text: '',
  types: new Set(ALL_CONTACT_KINDS),
  standings: new Set(STANDING_CATEGORIES),
};

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

export function activeContactsFilterCount(filter: ContactsFilter): number {
  let count = 0;
  if (filter.text.trim() !== '') count += 1;
  if (filter.types.size !== ALL_CONTACT_KINDS.length) count += 1;
  if (filter.standings.size !== STANDING_CATEGORIES.length) count += 1;
  return count;
}

export const STANDING_FILTER_KEY: Record<StandingCategory, string> = {
  good: 'contacts.filterGood',
  neutral: 'contacts.filterNeutral',
  bad: 'contacts.filterBad',
};

export function activeContactsFilters<F extends ContactsFilter>(
  filter: F,
  t: Translate
): ActiveFilter<F>[] {
  const active: ActiveFilter<F>[] = [];
  if (filter.types.size !== ALL_CONTACT_KINDS.length)
    active.push({
      label: t('contacts.typeFilterLabel'),
      value: summarizeFilterValues(
        ALL_CONTACT_KINDS.filter((kind) => filter.types.has(kind)).map((kind) =>
          t(CONTACT_KIND_KEY[kind])
        ),
        t
      ),
      clear: (value) => ({ ...value, types: EMPTY_CONTACTS_FILTER.types }),
    });
  if (filter.standings.size !== STANDING_CATEGORIES.length)
    active.push({
      label: t('contacts.standingFilterLabel'),
      value: summarizeFilterValues(
        STANDING_CATEGORIES.filter((category) => filter.standings.has(category)).map((category) =>
          t(STANDING_FILTER_KEY[category])
        ),
        t
      ),
      clear: (value) => ({ ...value, standings: EMPTY_CONTACTS_FILTER.standings }),
    });
  return active;
}

export function contactCountsByStanding(
  contacts: readonly CharacterContact[]
): Record<StandingCategory, number> {
  const counts: Record<StandingCategory, number> = { good: 0, neutral: 0, bad: 0 };
  for (const contact of contacts) counts[standingCategory(contact.standing)] += 1;
  return counts;
}

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
