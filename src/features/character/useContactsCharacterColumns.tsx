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
import { AchievementCell } from '@/features/character/AchievementLine';
import {
  useCharacterAchievements,
  useCharacterTitleNames,
} from '@/features/character/useCharacterAchievements';
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
}

/**
 * The Contacts page's This-character table: its columns, the optional-column
 * picker's state, the URL sort, and the affiliation rows the columns and the
 * CSV export both read.
 */
export function useContactsCharacterColumns({
  contacts,
  contactNames,
  contactLabels,
  affiliations,
  ownAffiliation,
}: ContactsCharacterColumnsInput) {
  const { t } = useTranslation();
  const characterColumnVisibility = useColumnVisibility(
    contactsCharacterColumnsStore,
    DEFAULT_VISIBLE_CONTACTS_CHARACTER_COLUMNS
  );
  // A character with no labels sees no Labels column at all — neither in the
  // table nor in the picker — so the table is exactly what it was.
  const hasLabels = contactLabels.size > 0;

  // Once per load rather than per render of a cell: `alsoVia` is a lookup
  // against an index built from the whole list, and the table re-renders on
  // every sort click and keystroke in the search box.
  const affiliationRows = useMemo(() => {
    const index = buildContactStandingIndex(contacts);
    return new Map<number, ContactAffiliationRow>(
      contacts.map((contact) => [
        contact.contact_id,
        contactAffiliationRow(contact, affiliations, ownAffiliation, index),
      ])
    );
  }, [contacts, affiliations, ownAffiliation]);

  // Title / Score reads one public record per player Character contact, so
  // only while its column shows; corps, alliances, factions and NPC agents never.
  const achievementIds = useMemo(() => achievementContactIds(contacts), [contacts]);
  const achievements = useCharacterAchievements(
    achievementIds,
    characterColumnVisibility.isVisible('achievement')
  );
  const titleNames = useCharacterTitleNames(
    [...achievements.values()].some((achievement) => achievement?.titleId)
  );

  // The identity column (never hidden) plus the optional columns the picker
  // controls, in table order — `CONTACTS_CHARACTER_COLUMN_IDS`' own order.
  const optionalCharacterColumns = useMemo<
    Record<ContactsCharacterColumnId, DataTableColumn<CharacterContact>>
  >(
    () => ({
      type: {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        // A player's "Player" and an NPC's "NPC agent" add nothing to the
        // phone card — the NPC tag beside the name already tells them apart —
        // so only a corp, alliance or faction says what it is there.
        render: (contact) => {
          const label = t(contactTypeLabelKey(contact));
          return contact.contact_type === 'character' ? <DenseOmit>{label}</DenseOmit> : label;
        },
        // Sorts on what is printed, not on ESI's word for it — otherwise
        // "Player" would sort under C and "Corp" under C too, by accident.
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
          // Stacked in the table; one line, `·`-joined, on the phone's dense card.
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
        // Corp first, alliance second: a reader sorting this column is
        // gathering a corp's pilots together, not an alliance's.
        sortValue: (contact) => {
          const row = affiliationRows.get(contact.contact_id);
          return row?.corporationId === null || row === undefined
            ? undefined
            : entityName(contactNames, row.corporationId);
        },
      },
      achievement: {
        id: 'achievement',
        header: t('characters.column.achievement'),
        render: (contact) => (
          <AchievementCell
            achievement={achievements.get(contact.contact_id)}
            titleNames={titleNames}
            stacks
          />
        ),
        sortValue: (contact) => achievements.get(contact.contact_id)?.score,
      },
      labels: {
        id: 'labels',
        header: t('contacts.labels'),
        // One line however many labels or however long: the full list is the
        // cell's tooltip, so truncation hides nothing.
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
        // The phone card's headline: the one thing a contact list is scanned by.
        cardCorner: true,
        // The tag replaces the bar *and* the number: the value is in its
        // accessible name and its tooltip, and the column sorts on the raw
        // number below, so nothing is lost by not printing it.
        render: (contact) => <StandingIcon value={contact.standing} />,
        sortValue: (contact) => contact.standing,
      },
      flags: {
        id: 'flags',
        header: t('contacts.flags'),
        align: 'center',
        // On the phone card the marks ride beside the name instead
        // (`ContactNameCell`). `!`: the dense card's own cell rule would
        // otherwise outrank a plain utility.
        className: 'max-sm:hidden!',
        render: (contact) =>
          contact.is_blocked === true || contact.is_watched === true ? (
            <ContactFlags contact={contact} />
          ) : (
            <EmptyCell />
          ),
        // Icon-only, but blocked/watched is a real two-level rank (issue
        // #1282) — blocked outranks watched, and a plain contact has neither
        // so it sinks (`undefined`) rather than sorting as "0".
        sortValue: (contact) => {
          const blocked = contact.is_blocked === true;
          const watched = contact.is_watched === true;
          if (!blocked && !watched) return undefined;
          return (blocked ? 2 : 0) + (watched ? 1 : 0);
        },
      },
    }),
    [t, contactNames, contactLabels, affiliationRows, achievements, titleNames]
  );
  // The ids the table and picker offer: `labels` only when there is something to show.
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
  // The full catalog, not just `columns`' currently-visible ids — see the
  // Across table's own `sortProps` for why.
  const characterSortProps = useUrlSort('sort', CHARACTER_SORT, [
    'name',
    ...CONTACTS_CHARACTER_COLUMN_IDS,
  ]);

  return {
    affiliationRows,
    optionalCharacterColumns,
    availableCharacterColumnIds,
    columns,
    characterColumnVisibility,
    characterSortProps,
  };
}
