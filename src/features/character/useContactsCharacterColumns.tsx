import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { StandingIcon, type DataTableColumn } from '@/components/ui';
import { HintText } from '@/components/ui/HintText';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { useUrlSort } from '@/lib/useUrlState';
import type { CharacterAffiliation, CharacterContact } from '@/esi/endpoints';
import {
  CONTACTS_CHARACTER_COLUMN_IDS,
  DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS,
  contactsCharacterColumnsStore,
  type ContactsCharacterColumnId,
} from '@/features/character/contactsColumns';
import { achievementContactIds } from '@/features/character/achievement';
import { achievementColumn } from '@/features/character/achievementColumn';
import { useCharacterAchievements } from '@/features/character/useCharacterAchievements';
import { contactLabelNames } from '@/features/character/contacts';
import { contactTypeLabelKey } from '@/features/character/contactsFilter';
import { buildContactStandingIndex } from '@/features/character/contactStandings';
import {
  contactAffiliationRow,
  type ContactAffiliationRow,
  type OwnAffiliation,
} from '@/features/character/contactAffiliation';
import { entityName } from '@/features/character/contactsSnapshot';
import {
  AffiliationLine,
  ContactFlags,
  ContactNameCell,
  DenseOmit,
  EmptyCell,
} from '@/features/character/ContactCells';
import { portraitColumn } from '@/features/character/contactsPortraitColumn';

const CHARACTER_SORT = { columnId: 'standing', direction: 'desc' } as const;

const CHARACTER_PORTRAIT_COLUMN = portraitColumn<CharacterContact>((contact) => contact);

interface ContactsCharacterColumnsInput {
  contacts: readonly CharacterContact[];
  contactNames: ReadonlyMap<number, string>;
  contactLabels: ReadonlyMap<number, string>;
  affiliations: ReadonlyMap<number, CharacterAffiliation>;
  ownAffiliation: OwnAffiliation;
  exportArmed?: boolean;
}

export function useContactsCharacterColumns({
  contacts,
  contactNames,
  contactLabels,
  affiliations,
  ownAffiliation,
  exportArmed = false,
}: ContactsCharacterColumnsInput) {
  const { t } = useTranslation();
  const characterColumnVisibility = useColumnVisibility(
    contactsCharacterColumnsStore,
    DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS
  );
  const hasLabels = contactLabels.size > 0;

  const affiliationRows = useMemo(() => {
    const index = buildContactStandingIndex(contacts);
    return new Map<number, ContactAffiliationRow>(
      contacts.map((contact) => [
        contact.contact_id,
        contactAffiliationRow(contact, affiliations, ownAffiliation, index),
      ])
    );
  }, [contacts, affiliations, ownAffiliation]);

  const achievementIds = useMemo(() => achievementContactIds(contacts), [contacts]);
  const achievements = useCharacterAchievements(
    achievementIds,
    characterColumnVisibility.isVisible('achievement') || exportArmed
  );
  const achievementsPending =
    exportArmed && achievementIds.some((id) => achievements.partsOf(id) === undefined);

  const optionalCharacterColumns = useMemo<
    Record<ContactsCharacterColumnId, DataTableColumn<CharacterContact>>
  >(
    () => ({
      type: {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        render: (contact) => {
          const label = t(contactTypeLabelKey(contact));
          return contact.contact_type === 'character' ? <DenseOmit>{label}</DenseOmit> : label;
        },
        sortValue: (contact) => t(contactTypeLabelKey(contact)),
      },
      affiliation: {
        id: 'affiliation',
        header: t('contacts.affiliation'),
        headerTooltip: t('contacts.affiliationHeaderTooltip'),
        render: (contact) => {
          const row = affiliationRows.get(contact.contact_id);
          if (!row || row.corporationId === null) return <EmptyCell />;
          const alsoVia = row.alsoVia;
          return (
            <span className="inline min-w-0 sm:flex sm:flex-col sm:items-start">
              <AffiliationLine
                name={entityName(contactNames, row.corporationId)}
                own={row.inOwnCorporation}
                ownLabel={t('contacts.ownCorporation')}
                alsoVia={alsoVia?.source === 'corporation' ? alsoVia : null}
              />
              {row.allianceId !== null && (
                <span aria-hidden className="sm:hidden">
                  {' · '}
                </span>
              )}
              {row.allianceId !== null && (
                <AffiliationLine
                  name={entityName(contactNames, row.allianceId)}
                  own={row.inOwnAlliance}
                  ownLabel={t('contacts.ownAlliance')}
                  alsoVia={alsoVia?.source === 'alliance' ? alsoVia : null}
                  dim
                />
              )}
            </span>
          );
        },
        sortValue: (contact) => {
          const row = affiliationRows.get(contact.contact_id);
          return row?.corporationId === null || row === undefined
            ? undefined
            : entityName(contactNames, row.corporationId);
        },
      },
      achievement: achievementColumn(t, (contact) => contact.contact_id, achievements, true),
      labels: {
        id: 'labels',
        header: t('contacts.labels'),
        render: (contact) => {
          const names = contactLabelNames(contact, contactLabels);
          if (names.length === 0) return <EmptyCell />;
          const text = names.join(', ');
          return (
            <HintText content={text} className="inline-block max-w-56 truncate align-bottom">
              {text}
            </HintText>
          );
        },
        sortValue: (contact) => contactLabelNames(contact, contactLabels)[0],
      },
      standing: {
        id: 'standing',
        header: t('contacts.standing'),
        align: 'center',
        cardCorner: true,
        render: (contact) => <StandingIcon value={contact.standing} />,
        sortValue: (contact) => contact.standing,
      },
      flags: {
        id: 'flags',
        header: t('contacts.flags'),
        align: 'center',
        className: 'max-sm:hidden!',
        render: (contact) =>
          contact.is_blocked === true || contact.is_watched === true ? (
            <ContactFlags contact={contact} />
          ) : (
            <EmptyCell />
          ),
        sortValue: (contact) => {
          const blocked = contact.is_blocked === true;
          const watched = contact.is_watched === true;
          if (!blocked && !watched) return undefined;
          return (blocked ? 2 : 0) + (watched ? 1 : 0);
        },
      },
    }),
    [t, contactNames, contactLabels, affiliationRows, achievements]
  );
  const availableCharacterColumnIds = useMemo(
    () => CONTACTS_CHARACTER_COLUMN_IDS.filter((id) => id !== 'labels' || hasLabels),
    [hasLabels]
  );
  const flagsVisible = characterColumnVisibility.isVisible('flags');
  const columns = useMemo<DataTableColumn<CharacterContact>[]>(
    () => [
      CHARACTER_PORTRAIT_COLUMN,
      {
        id: 'name',
        header: t('contacts.name'),
        primary: true,
        render: (contact) => (
          <ContactNameCell
            contact={contact}
            name={contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`}
            flags={flagsVisible && <ContactFlags contact={contact} />}
          />
        ),
        sortValue: (contact) => contactNames.get(contact.contact_id) ?? `#${contact.contact_id}`,
      },
      ...availableCharacterColumnIds
        .filter(characterColumnVisibility.isVisible)
        .map((id) => optionalCharacterColumns[id]),
    ],
    [
      t,
      flagsVisible,
      contactNames,
      optionalCharacterColumns,
      availableCharacterColumnIds,
      characterColumnVisibility.isVisible,
    ]
  );
  const characterSortProps = useUrlSort('sort', CHARACTER_SORT, [
    'name',
    ...CONTACTS_CHARACTER_COLUMN_IDS,
  ]);

  return {
    affiliationRows,
    achievements,
    achievementsPending,
    optionalCharacterColumns,
    availableCharacterColumnIds,
    columns,
    characterColumnVisibility,
    characterSortProps,
  };
}
