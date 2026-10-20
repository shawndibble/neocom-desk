import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { FilterBar, FilterChip, SearchInput } from '@/components/ui';
import {
  ALL_CONTACT_KINDS,
  CONTACT_KIND_KEY,
  STANDING_CATEGORIES,
  activeContactsFilterCount,
  type ContactKind,
  type ContactsFilter,
  type StandingCategory,
} from '@/features/character/contactsFilter';
import { toggleInSet } from '@/lib/sets';

export interface ContactCounts {
  standing: Record<StandingCategory, number>;
  type: Record<ContactKind, number>;
}

const STANDING_FILTER_KEY: Record<StandingCategory, string> = {
  good: 'contacts.filterGood',
  neutral: 'contacts.filterNeutral',
  bad: 'contacts.filterBad',
};

/**
 * `ContactsFilter` plus the Across tab's own criterion, so the sheet's draft
 * (issue #1282) can hold "Only disagreements" the same way it holds every
 * other chip — committed on Apply below `md`, immediately in the pointer-width
 * box. Local to this bar: `ContactsFilter` itself stays the Character tab's
 * type, with no across-only field grafted on for one consumer.
 */
type ContactsBarValue = ContactsFilter & { disagreementsOnly: boolean };

interface ContactsFilterBarProps {
  filter: ContactsFilter;
  onChange: (filter: ContactsFilter) => void;
  counts: ContactCounts;
  view: 'character' | 'across';
  disagreementsOnly: boolean;
  onDisagreementsOnlyChange: (value: boolean) => void;
  disagreementCount: number;
  /** The active tab's column picker, drawn beside the filter trigger. */
  actions?: ReactNode;
}

/**
 * Search plus a chip per contact type and per standing category. Both groups
 * show every member with its count, zeros included — so "you have no alliance
 * contacts" is on screen rather than inferred from a missing chip. Shared by
 * both tabs (issue #1282's picker is per-tab, in `actions`); the Across tab
 * adds its own "disagreements only" chip, since that criterion means nothing
 * on the Character tab.
 */
export function ContactsFilterBar({
  filter,
  onChange,
  counts,
  view,
  disagreementsOnly,
  onDisagreementsOnlyChange,
  disagreementCount,
  actions,
}: ContactsFilterBarProps) {
  const { t } = useTranslation();
  const activeCount =
    activeContactsFilterCount(filter) + (view === 'across' && disagreementsOnly ? 1 : 0);
  const value: ContactsBarValue = { ...filter, disagreementsOnly };
  const handleChange = (next: ContactsBarValue) => {
    const { disagreementsOnly: nextDisagreementsOnly, ...nextFilter } = next;
    onChange(nextFilter);
    if (nextDisagreementsOnly !== disagreementsOnly)
      onDisagreementsOnlyChange(nextDisagreementsOnly);
  };
  return (
    <FilterBar
      value={value}
      onChange={handleChange}
      activeCount={activeCount}
      actions={actions}
      search={
        <SearchInput
          value={filter.text}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
          placeholder={t('contacts.searchPlaceholder')}
          aria-label={t('contacts.searchPlaceholder')}
          className="min-w-48 flex-1"
        />
      }
    >
      {(draft, setDraft) => (
        <>
          <div
            role="group"
            aria-label={t('contacts.typeFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {ALL_CONTACT_KINDS.map((type) => (
              <FilterChip
                key={type}
                label={t(CONTACT_KIND_KEY[type])}
                selected={draft.types.has(type)}
                onToggle={() => setDraft({ ...draft, types: toggleInSet(draft.types, type) })}
                count={counts.type[type]}
              />
            ))}
          </div>
          <div
            role="group"
            aria-label={t('contacts.standingFilterLabel')}
            className="flex flex-wrap gap-2"
          >
            {STANDING_CATEGORIES.map((category) => (
              <FilterChip
                key={category}
                label={t(STANDING_FILTER_KEY[category])}
                selected={draft.standings.has(category)}
                onToggle={() =>
                  setDraft({ ...draft, standings: toggleInSet(draft.standings, category) })
                }
                count={counts.standing[category]}
              />
            ))}
          </div>
          {view === 'across' && (
            <FilterChip
              label={t('contacts.acrossDisagreementsOnly')}
              selected={draft.disagreementsOnly}
              onToggle={() => setDraft({ ...draft, disagreementsOnly: !draft.disagreementsOnly })}
              count={disagreementCount}
            />
          )}
        </>
      )}
    </FilterBar>
  );
}
