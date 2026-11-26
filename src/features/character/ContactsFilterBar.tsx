import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FilterBar,
  FilterChip,
  FilterField,
  SearchInput,
  type ActiveFilter,
} from '@/components/ui';
import {
  ALL_CONTACT_KINDS,
  CONTACT_KIND_KEY,
  STANDING_CATEGORIES,
  STANDING_FILTER_KEY,
  activeContactsFilters,
  type ContactKind,
  type ContactsFilter,
  type StandingCategory,
} from '@/features/character/contactsFilter';
import { toggleInSet } from '@/lib/sets';

export interface ContactCounts {
  standing: Record<StandingCategory, number>;
  type: Record<ContactKind, number>;
}

type ContactsBarValue = ContactsFilter & { disagreementsOnly: boolean };

interface ContactsFilterBarProps {
  filter: ContactsFilter;
  onChange: (filter: ContactsFilter) => void;
  counts: ContactCounts;
  view: 'character' | 'across';
  disagreementsOnly: boolean;
  onDisagreementsOnlyChange: (value: boolean) => void;
  disagreementCount: number;
  actions?: ReactNode;
}

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
  const value: ContactsBarValue = { ...filter, disagreementsOnly };
  const disagreementsLabel = t('contacts.acrossDisagreementsOnly');
  const active: ActiveFilter<ContactsBarValue>[] = [
    ...activeContactsFilters(value, t),
    ...(view === 'across' && disagreementsOnly
      ? [
          {
            label: disagreementsLabel,
            clear: (next: ContactsBarValue) => ({ ...next, disagreementsOnly: false }),
          },
        ]
      : []),
  ];
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
      active={active}
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
          <FilterField label={t('contacts.typeFilterLabel')} stretch={false}>
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
          </FilterField>
          <FilterField label={t('contacts.standingFilterLabel')} stretch={false}>
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
          </FilterField>
          {view === 'across' && (
            <FilterField label={disagreementsLabel} stretch={false} hideCaption>
              <FilterChip
                label={disagreementsLabel}
                selected={draft.disagreementsOnly}
                onToggle={() => setDraft({ ...draft, disagreementsOnly: !draft.disagreementsOnly })}
                count={disagreementCount}
              />
            </FilterField>
          )}
        </>
      )}
    </FilterBar>
  );
}
