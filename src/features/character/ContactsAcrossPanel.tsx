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

/** An Across row as the identity the shared helpers read. */
function acrossIdentity(row: AcrossCharactersRow): ContactIdentity {
  return { contact_id: row.contactId, contact_type: row.contactType };
}

const ACROSS_PORTRAIT_COLUMN = portraitColumn<AcrossCharactersRow>(acrossIdentity);

const ACROSS_SORT = { columnId: 'held', direction: 'asc' } as const;

interface AcrossCharactersPanelProps {
  lists: readonly CharacterContactList[];
  names: ReadonlyMap<number, string>;
  filter: ContactsFilter;
  /** Lifted to `Contacts` (issue #1282): its chip now lives in the shared `FilterBar`. */
  disagreementsOnly: boolean;
  /** Reports the count up on every change, so the lifted chip can badge it — the `ContractSearchPanel`/`onStatusChange` pattern. */
  onDisagreementCountChange: (count: number) => void;
  isColumnVisible: (id: ContactsAcrossColumnId) => boolean;
  /** Reports the currently filtered rows up, so the page header's export (issue #2164) can read this tab's own rows without owning its fetch/merge state. The export itself reads them in the table's on-screen sort. */
  onVisibleRowsChange: (rows: readonly AcrossCharactersRow[]) => void;
  /** Reports whether any list behind the current merge is truncated, so the CSV export's filename can carry the same "-partial" suffix the Character tab's own truncated export does. */
  onTruncatedChange: (truncated: boolean) => void;
  /** The page header's export button for this tab, so the table's row menus export the same rows. */
  tableExport: UseTableExport<AcrossCharactersRow>;
}

/**
 * The same contacts, every Character at once: who holds each one, who does
 * not, and where they set it differently.
 *
 * Reads what each Character last cached rather than fetching them all on
 * arrival — a pilot with a dozen alts would otherwise pay a dozen paginated
 * fetches for opening a tab. The button fetches them on demand, and the hint
 * below the table says which of the two is on screen.
 */
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
  // Any one character's own fetch stopping short makes the whole merge
  // incomplete — the export's "-partial" suffix (issue #2164) has to cover
  // that the same way the Character tab's own truncation does.
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

  // The identity column (never hidden) plus the optional columns the picker
  // controls, in table order — `CONTACTS_ACROSS_COLUMN_IDS`' own order.
  // Memoized so the `sortValue`s `DataTable` keys its sort on keep their
  // identity across renders (a keystroke in the filter re-renders this).
  const acrossListCount = effectiveLists.length;
  const optionalColumns = useMemo<
    Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>>
  >(
    () => ({
      type: {
        id: 'type',
        header: t('contacts.type'),
        className: 'text-text-dim',
        // As the character table: a player's or agent's type stays off the phone card.
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
        // The names go in the tooltip rather than the cell: with a dozen alts
        // the cell would be the widest thing on the page, and the count is what
        // a reader scans for. The count takes focus so a keyboard can open it.
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
        // The phone card's headline, as Standing is on the character table.
        cardCorner: true,
        // Every distinct standing, not an average: two alts at +10 and -10 have
        // no meaningful midpoint, and seeing both is the whole point of the row.
        render: (row) => (
          <span className="inline-flex items-center gap-1.5">
            {row.standings.map((standing) => (
              <StandingIcon key={standing} value={standing} />
            ))}
          </span>
        ),
        // Worst first on a descending click, which is the direction trouble is in.
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
  // The full catalog, not just `columns`' currently-visible ids: a sort
  // picked while a column was shown should still resolve once the picker
  // hides it, ready to take effect again the moment it's shown back
  // (`resolveSort` only rejects a `columnId` the catalog has never heard of).
  const sortProps = useUrlSort('across.sort', ACROSS_SORT, ['name', ...CONTACTS_ACROSS_COLUMN_IDS]);

  if (rows.length === 0) {
    return (
      <EmptyState title={t('contacts.acrossEmptyTitle')} hint={t('contacts.acrossEmptyHint')} />
    );
  }

  return (
    <Panel padded={false}>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void fetchEveryCharacter()}
          disabled={fetching}
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
          // A faction has no Show Info (no public faction endpoint): not a tab stop either.
          rowClickable={(row) => contactPublicInfoKind(acrossIdentity(row)) !== null}
        />
      )}
    </Panel>
  );
}
