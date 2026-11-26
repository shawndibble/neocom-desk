import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  EmptyState,
  Panel,
  StandingIcon,
  Tooltip,
  type DataTableColumn,
} from '@/components/ui';
import { cx } from '@/lib/cx';
import { useUrlSort } from '@/lib/useUrlState';
import { usePublicInfoModal } from '@/stores/publicInfoModal';
import type { UseTableExport } from '@/components/ui/useTableExport';
import {
  CONTACTS_ACROSS_COLUMN_IDS,
  type ContactsAcrossColumnId,
} from '@/features/character/contactsColumns';
import {
  contactKind,
  contactPublicInfoKind,
  contactTypeLabelKey,
  type ContactIdentity,
  type ContactsFilter,
} from '@/features/character/contactsFilter';
import {
  loadContactsAcrossCharacters,
  mergeContactsAcrossCharacters,
  type AcrossCharactersRow,
  type CharacterContactList,
} from '@/features/character/contactsAcrossCharacters';
import { ContactNameCell, DenseOmit } from '@/features/character/ContactCells';
import { portraitColumn } from '@/features/character/contactsPortraitColumn';
import { entityName } from '@/features/character/contactsSnapshot';

function acrossIdentity(row: AcrossCharactersRow): ContactIdentity {
  return { contact_id: row.contactId, contact_type: row.contactType };
}

const ACROSS_PORTRAIT_COLUMN = portraitColumn<AcrossCharactersRow>(acrossIdentity);

const ACROSS_SORT = { columnId: 'held', direction: 'asc' } as const;

interface AcrossCharactersPanelProps {
  lists: readonly CharacterContactList[];
  names: ReadonlyMap<number, string>;
  filter: ContactsFilter;
  disagreementsOnly: boolean;
  onDisagreementCountChange: (count: number) => void;
  isColumnVisible: (id: ContactsAcrossColumnId) => boolean;
  onVisibleRowsChange: (rows: readonly AcrossCharactersRow[]) => void;
  onTruncatedChange: (truncated: boolean) => void;
  tableExport: UseTableExport<AcrossCharactersRow>;
}

export function AcrossCharactersPanel({
  lists,
  names,
  filter,
  disagreementsOnly,
  onDisagreementCountChange,
  isColumnVisible,
  onVisibleRowsChange,
  onTruncatedChange,
  tableExport,
}: AcrossCharactersPanelProps) {
  const { t } = useTranslation();
  const { open } = usePublicInfoModal();
  const [fetched, setFetched] = useState<readonly CharacterContactList[] | null>(null);
  const [fetching, setFetching] = useState(false);

  const effectiveLists = fetched ?? lists;
  const rows = useMemo(() => mergeContactsAcrossCharacters(effectiveLists), [effectiveLists]);
  const disagreementCount = useMemo(() => rows.filter((row) => row.disagrees).length, [rows]);
  useEffect(
    () => onDisagreementCountChange(disagreementCount),
    [disagreementCount, onDisagreementCountChange]
  );
  const truncated = useMemo(() => effectiveLists.some((list) => list.truncated), [effectiveLists]);
  useEffect(() => onTruncatedChange(truncated), [truncated, onTruncatedChange]);

  const text = filter.text.trim().toLowerCase();
  const visibleRows = useMemo(
    () =>
      rows.filter((row) => {
        if (disagreementsOnly && !row.disagrees) return false;
        if (!filter.types.has(contactKind(acrossIdentity(row)))) return false;
        if (text === '') return true;
        return entityName(names, row.contactId).toLowerCase().includes(text);
      }),
    [rows, disagreementsOnly, filter.types, text, names]
  );
  useEffect(() => onVisibleRowsChange(visibleRows), [visibleRows, onVisibleRowsChange]);

  async function fetchEveryCharacter() {
    setFetching(true);
    try {
      setFetched(await loadContactsAcrossCharacters({ live: true }));
    } finally {
      setFetching(false);
    }
  }

  const acrossListCount = effectiveLists.length;
  const optionalColumns = useMemo<
    Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>>
  >(
    () => ({
      type: {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        render: (row) => {
          const label = t(contactTypeLabelKey(acrossIdentity(row)));
          return row.contactType === 'character' ? <DenseOmit>{label}</DenseOmit> : label;
        },
        sortValue: (row) => t(contactTypeLabelKey(acrossIdentity(row))),
      },
      held: {
        id: 'held',
        header: t('contacts.acrossCharacters'),
        headerTooltip: t('contacts.acrossCharactersHeaderTooltip'),
        align: 'center',
        render: (row) => (
          <Tooltip
            content={[
              t('contacts.acrossHeldBy', { names: row.held.map((h) => h.name).join(', ') }),
              row.missing.length > 0 &&
                t('contacts.acrossMissingOn', {
                  names: row.missing.map((m) => m.name).join(', '),
                }),
            ]
              .filter(Boolean)
              .join(' · ')}
            openOnTap
          >
            <span
              tabIndex={0}
              className={cx(
                'tabular-nums focus-visible:outline-2 focus-visible:outline-accent',
                row.missing.length > 0 && 'text-warning'
              )}
            >
              {t('contacts.acrossCharactersCount', {
                count: row.held.length,
                total: acrossListCount,
              })}
            </span>
          </Tooltip>
        ),
        sortValue: (row) => row.held.length,
      },
      standings: {
        id: 'standings',
        header: t('contacts.acrossStandings'),
        align: 'center',
        cardCorner: true,
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            {row.standings.map((standing) => (
              <StandingIcon key={standing} value={standing} />
            ))}
          </span>
        ),
        sortValue: (row) => row.standings[0],
      },
    }),
    [t, acrossListCount]
  );
  const nameColumn = useMemo<DataTableColumn<AcrossCharactersRow>>(
    () => ({
      id: 'name',
      header: t('contacts.name'),
      primary: true,
      render: (row) => (
        <ContactNameCell contact={acrossIdentity(row)} name={entityName(names, row.contactId)} />
      ),
      sortValue: (row) => entityName(names, row.contactId),
    }),
    [t, names]
  );
  const columns: DataTableColumn<AcrossCharactersRow>[] = [
    ACROSS_PORTRAIT_COLUMN,
    nameColumn,
    ...CONTACTS_ACROSS_COLUMN_IDS.filter(isColumnVisible).map((id) => optionalColumns[id]),
  ];
  const sortProps = useUrlSort('across.sort', ACROSS_SORT, ['name', ...CONTACTS_ACROSS_COLUMN_IDS]);

  if (rows.length === 0) {
    const allRead = effectiveLists.length > 0 && effectiveLists.every((list) => list.read);
    return (
      <EmptyState
        title={t(allRead ? 'contacts.emptyFetchedTitle' : 'contacts.acrossEmptyTitle')}
        hint={t(allRead ? 'contacts.emptyFetchedHint' : 'contacts.acrossEmptyHint')}
      />
    );
  }

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void fetchEveryCharacter()}
          loading={fetching}
        >
          {t('contacts.acrossFetchAll')}
        </Button>
      </div>
      {fetched === null && (
        <p className="px-3 pt-2 text-[0.6875rem] text-text-dim">{t('contacts.acrossCachedHint')}</p>
      )}
      {visibleRows.length === 0 ? (
        <EmptyState
          title={t('contacts.acrossNoResults')}
          hint={t('contacts.acrossNoResultsHint')}
          className="py-8"
        />
      ) : (
        <DataTable
          {...tableExport.tableProps}
          label={t('contacts.acrossLabel')}
          columns={columns}
          rows={visibleRows}
          rowKey={(row) => `${row.contactType}:${row.contactId}`}
          {...sortProps}
          mobileSort
          stackLayout="dense"
          onRowClick={(row) => {
            const kind = contactPublicInfoKind(acrossIdentity(row));
            if (kind) open(kind, row.contactId);
          }}
          rowClickable={(row) => contactPublicInfoKind(acrossIdentity(row)) !== null}
        />
      )}
    </Panel>
  );
}
