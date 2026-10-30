import { NO_AFFILIATIONS, NO_NAMES } from '@/lib/emptyCollections';
import { useDeferredValue, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataAgeBadge,
  DataTable,
  CachedEmptyState,
  EmptyState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Tabs,
  TabPanel,
  useTabsId,
  type DataTableColumn,
  CachedNotice,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { useColumnVisibility } from '@/lib/columnVisibility';
import {
  CONTACTS_ACROSS_COLUMN_IDS,
  contactsAcrossColumnsStore,
  type ContactsAcrossColumnId,
} from '@/features/character/contactsColumns';
import { GrantBanner } from '@/app/GrantNote';
import { ReauthCachedNote } from '@/app/ReauthCachedNote';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { contactsAcrossCsvColumns, contactsCsvColumns } from '@/features/character/contactsCsv';
import {
  ALL_CONTACT_KINDS,
  STANDING_CATEGORIES,
  EMPTY_CONTACTS_FILTER,
  activeContactsFilterCount,
  contactCountsByKind,
  contactCountsByStanding,
  contactPublicInfoKind,
  filterContacts,
  type ContactsFilter,
} from '@/features/character/contactsFilter';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useCharacterCount } from '@/features/character/useCharacters';
import { usePublicInfoModal } from '@/stores/publicInfoModal';
import { type AcrossCharactersRow } from '@/features/character/contactsAcrossCharacters';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { usePageTab } from '@/lib/usePageTab';
import { useUrlParams } from '@/lib/useUrlState';
import { boolParam, enumSetParam, textParam } from '@/lib/urlState';
import { CONTACTS_TABS } from '@/app/pageTabs';
import { tabBarTabs } from '@/lib/pageTabs';
import { useContactsStandings } from './ContactsStandings';
import { useContactsCharacterColumns } from '@/features/character/useContactsCharacterColumns';
import { AcrossCharactersPanel } from '@/features/character/ContactsAcrossPanel';
import { ContactsFilterBar, type ContactCounts } from '@/features/character/ContactsFilterBar';
import {
  NO_LABELS,
  NO_LISTS,
  NO_OWN_AFFILIATION,
  loadContactsSnapshot,
} from '@/features/character/contactsSnapshot';

/**
 * The filter bar, in the URL (ADR 0015) as one group — including the Across
 * tab's own "disagreements only" (issue #1282): two separate `useUrlParams`
 * groups writing in the same tick would each start from the URL as last
 * rendered and the second would drop the first (see `useUrlState.ts`'s own
 * doc comment), so every key `ContactsFilterBar` can change belongs here.
 */
const FILTER_PARAMS = {
  q: textParam(),
  types: enumSetParam(ALL_CONTACT_KINDS),
  standing: enumSetParam(STANDING_CATEGORIES),
  'across.disagree': boolParam(),
};

/** Contacts: standings, blocked/watched state, searchable and filterable by type and standing. */
export function Contacts() {
  const characterCount = useCharacterCount();
  const { t } = useTranslation();
  const { data, error, loading, hydrated, activeCharacterId, refresh } = useRouteSnapshot(
    loadContactsSnapshot,
    undefined,
    { cacheKey: 'contacts' }
  );

  const [filterParams, setFilterParams] = useUrlParams(FILTER_PARAMS);
  const filter = useMemo<ContactsFilter>(
    () => ({ text: filterParams.q, types: filterParams.types, standings: filterParams.standing }),
    [filterParams]
  );
  // Rows derive from a deferred copy so a keystroke paints the box first
  // (`useUrlFilter`'s rule); the bar and its setter keep the immediate one.
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContactsFilter) =>
    setFilterParams({ q: next.text, types: next.types, standing: next.standings });
  const [tab, setTab] = usePageTab(CONTACTS_TABS);
  const tabsId = useTabsId();
  const standings = useContactsStandings(activeCharacterId ?? 0, tab === 'standings');
  const { open: openPublicInfo } = usePublicInfoModal();

  // Lifted out of `AcrossCharactersPanel` (issue #1282): its chip now lives in
  // the shared `ContactsFilterBar`, which neither tab's panel owns.
  const disagreementsOnly = filterParams['across.disagree'];
  const setDisagreementsOnly = (next: boolean) => setFilterParams({ 'across.disagree': next });
  const [disagreementCount, setDisagreementCount] = useState(0);
  // Lifted the same way `disagreementCount` is (issue #2164): the page
  // header's CSV export needs the Across tab's own filtered rows, and only
  // `AcrossCharactersPanel` has the fetch state (`effectiveLists`) they come
  // from.
  const [acrossVisibleRows, setAcrossVisibleRows] = useState<readonly AcrossCharactersRow[]>([]);
  const [acrossTruncated, setAcrossTruncated] = useState(false);

  const acrossColumnVisibility = useColumnVisibility(
    contactsAcrossColumnsStore,
    CONTACTS_ACROSS_COLUMN_IDS
  );

  const contactsResult = data?.contactsResult ?? null;
  const contactsNeedsReauth = data?.contactsNeedsReauth ?? false;
  const contactsTruncated = data?.contactsTruncated ?? false;
  const contactNames = data?.contactNames ?? NO_NAMES;
  const contactLabels = data?.contactLabels ?? NO_LABELS;
  const affiliations = data?.affiliations ?? NO_AFFILIATIONS;
  const acrossLists = data?.acrossLists ?? NO_LISTS;
  const ownAffiliation = data?.ownAffiliation ?? NO_OWN_AFFILIATION;

  const contacts = useMemo(() => contactsResult?.data ?? [], [contactsResult]);
  const {
    affiliationRows,
    optionalCharacterColumns,
    availableCharacterColumnIds,
    columns,
    characterColumnVisibility,
    characterSortProps,
  } = useContactsCharacterColumns({
    contacts,
    contactNames,
    contactLabels,
    affiliations,
    ownAffiliation,
  });

  const counts = useMemo(
    () => ({
      standing: contactCountsByStanding(contacts),
      type: contactCountsByKind(contacts),
    }),
    [contacts]
  );

  // Refreshing bumps useRouteSnapshot's epoch, which clears `data` (and so
  // `contactsResult`/`counts`) until the new load lands — remember
  // the last successful counts so the filter chips (and the user's active
  // selection) stay on screen through a refresh instead of disappearing.
  // Switching character bumps the same epoch, so the remembered counts must
  // be dropped there too — otherwise the outgoing character's chips would
  // linger under the incoming one until its own load lands.
  const [lastGoodCounts, setLastGoodCounts] = useState<ContactCounts | null>(null);
  const [lastGoodCharacterId, setLastGoodCharacterId] = useState(activeCharacterId);
  if (activeCharacterId !== lastGoodCharacterId) {
    setLastGoodCharacterId(activeCharacterId);
    setLastGoodCounts(null);
  } else if (contactsResult && lastGoodCounts !== counts) {
    setLastGoodCounts(counts);
  }

  const filteredContacts = useMemo(
    () => filterContacts(contacts, rowsFilter, contactNames),
    [contacts, rowsFilter, contactNames]
  );

  // `/contacts/across` with a single Character falls back to this Character's
  // view — but only once the snapshot says so: before it loads the list is
  // empty for everyone, and a reload of the across tab must not bounce.
  const view =
    tab === 'across' && (data === undefined || acrossLists.length > 1) ? 'across' : 'character';

  // Labels only, for the picker's menu — the real columns (with their
  // `render`) are built inside `AcrossCharactersPanel`, which alone has the
  // fetch state (`effectiveLists.length`) one of them needs. `ColumnPickerMenu`
  // never calls `render`, so the stub here can't drift into what's on screen.
  const acrossColumnsById: Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>> = {
    type: { id: 'type', header: t('contacts.type'), render: () => null },
    held: { id: 'held', header: t('contacts.acrossCharacters'), render: () => null },
    standings: { id: 'standings', header: t('contacts.acrossStandings'), render: () => null },
  };

  // One `ColumnPickerMenu` in the shared `FilterBar`, controlling whichever
  // tab's table is showing (issue #1282) — each tab keeps its own visibility
  // setting, so switching tabs never carries one's hidden columns onto the other's.
  const columnPickerActions =
    view === 'across' ? (
      <ColumnPickerMenu
        available={CONTACTS_ACROSS_COLUMN_IDS}
        visible={acrossColumnVisibility.visible}
        columnsById={acrossColumnsById}
        onToggle={acrossColumnVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={acrossColumnVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    ) : (
      <ColumnPickerMenu
        available={availableCharacterColumnIds}
        visible={characterColumnVisibility.visible}
        columnsById={optionalCharacterColumns}
        onToggle={characterColumnVisibility.toggle}
        buttonLabel={t('common.columnsButton')}
        menuTitle={t('common.columnsMenuTitle')}
        onReset={characterColumnVisibility.reset}
        resetLabel={t('common.resetColumns')}
      />
    );

  // One export button in the page header, exporting whichever tab's table is showing —
  // each tab keeps its own surface so the two files never share a name.
  const characterCsvColumns = useMemo(
    () => contactsCsvColumns(t, contactNames, affiliationRows),
    [t, contactNames, affiliationRows]
  );
  const characterExport = useTableExport({
    surface: 'contacts',
    rows: filteredContacts,
    columns: characterCsvColumns,
    truncated: contactsTruncated,
  });
  const acrossCsvColumns = useMemo(
    () => contactsAcrossCsvColumns(t, contactNames),
    [t, contactNames]
  );
  const acrossExport = useTableExport({
    surface: 'contacts-across',
    rows: acrossVisibleRows,
    columns: acrossCsvColumns,
    truncated: acrossTruncated,
  });
  if (!hydrated) {
    return <Spinner block="page" label={t('common.loading')} />;
  }
  if (activeCharacterId === null) return <Navigate to="/characters" replace />;

  // `across` is a scope of the contacts list, picked by the header's This character /
  // All characters control, not a tab of its own (its path stays, so links keep working).
  const shownTab = tab === 'standings' ? 'standings' : 'character';
  const tabBar = (
    <Tabs
      tabsId={tabsId}
      label={t('contacts.title')}
      value={shownTab}
      onChange={(id) =>
        setTab(id === 'character' && view === 'across' ? 'across' : (id as typeof tab))
      }
      tabs={tabBarTabs(CONTACTS_TABS)
        .filter((item) => item.id !== 'across')
        .map((item) => ({ id: item.id, label: t(item.labelKey) }))}
    />
  );
  return (
    <div className="mx-auto max-w-page space-y-4">
      <PageHeader
        title={t('contacts.title')}
        meta={
          tab === 'standings'
            ? standings.meta
            : contactsResult && <DataAgeBadge date={contactsResult.fetchedAt} />
        }
        // Not on Standings: that tab reads the active Character's standings only.
        // Always the control otherwise, so the header's one-line lock never flips:
        // with one Character it hides itself (nothing to compare the roster with).
        scope={
          tab === 'standings' ? undefined : (
            <CharacterFilterControl
              activeCharacterId={activeCharacterId}
              value={view === 'across' ? 'all' : 'current'}
              characterCount={characterCount}
              onChange={(next) => setTab(next === 'all' ? 'across' : 'character')}
            />
          )
        }
        actions={
          tab === 'standings' ? (
            standings.actions
          ) : (
            <>
              {view === 'across' ? (
                <TableActionsMenu
                  name={t('contacts.tabAcrossCharacters')}
                  tableExport={acrossExport}
                  size="md"
                />
              ) : (
                <TableActionsMenu
                  name={t('contacts.title')}
                  tableExport={characterExport}
                  size="md"
                />
              )}
              <IconButton
                icon={<Icon.Refresh />}
                label={t('contacts.refresh')}
                onClick={refresh}
                disabled={loading}
              />
            </>
          )
        }
      />

      {tabBar}

      <TabPanel tabsId={tabsId} tabId={shownTab} className="space-y-4">
        {tab === 'standings' ? (
          standings.content
        ) : (
          <>
            {/* Shared with the second tab: a name typed into the box, or a type
          switched off, means the same thing on either. The standing chips do
          not — a row there carries several standings — so that tab ignores
          them and says so with a chip of its own. */}
            {lastGoodCounts && (
              <ContactsFilterBar
                filter={filter}
                onChange={setFilter}
                counts={lastGoodCounts}
                view={view}
                disagreementsOnly={disagreementsOnly}
                onDisagreementsOnlyChange={setDisagreementsOnly}
                disagreementCount={disagreementCount}
                actions={columnPickerActions}
              />
            )}

            {loading && !data ? (
              <Spinner block="page" label={t('common.loading')} />
            ) : view === 'across' ? (
              <AcrossCharactersPanel
                lists={acrossLists}
                names={contactNames}
                filter={rowsFilter}
                disagreementsOnly={disagreementsOnly}
                onDisagreementCountChange={setDisagreementCount}
                isColumnVisible={acrossColumnVisibility.isVisible}
                onVisibleRowsChange={setAcrossVisibleRows}
                onTruncatedChange={setAcrossTruncated}
                tableExport={acrossExport}
              />
            ) : contactsNeedsReauth && (!contactsResult || contacts.length === 0) ? (
              // A lapsed grant with no saved contacts: the full banner. With
              // saved contacts the table stays and a small note sits above it.
              <GrantBanner
                characterId={activeCharacterId}
                endpoints={['getCharacterContacts']}
                title={t('contacts.reauthTitle')}
                hint={t('contacts.reauthHint')}
                actionLabel={t('contacts.reauthAction')}
              />
            ) : error ? (
              <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
            ) : !contactsResult || contacts.length === 0 ? (
              <CachedEmptyState
                result={contactsResult}
                title={t('contacts.emptyTitle')}
                hint={t('contacts.emptyHint')}
                fetchedTitle={t('contacts.emptyFetchedTitle')}
              />
            ) : (
              <Panel padded={false}>
                {contactsNeedsReauth && (
                  <ReauthCachedNote
                    className="border-b border-line p-3"
                    characterId={activeCharacterId}
                    endpoints={['getCharacterContacts']}
                  />
                )}
                {contactsResult.fromCache && (
                  <CachedNotice className="px-3 pt-2" fetchedAt={contactsResult.fetchedAt} />
                )}
                {contactsTruncated && (
                  <p className="px-3 pt-2 text-[0.6875rem] text-warning uppercase">
                    {t('common.incompleteTitle')}
                  </p>
                )}
                {filteredContacts.length === 0 ? (
                  <EmptyState
                    title={t('contacts.noResults')}
                    hint={t('contacts.noResultsHint')}
                    className="py-8"
                    action={
                      activeContactsFilterCount(filter) > 0 ? (
                        <Button size="sm" onClick={() => setFilter(EMPTY_CONTACTS_FILTER)}>
                          {t('common.resetFilters')}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <DataTable
                    {...characterExport.tableProps}
                    label={t('contacts.title')}
                    columns={columns}
                    rows={filteredContacts}
                    rowKey={(contact) => contact.contact_id}
                    {...characterSortProps}
                    mobileSort
                    stackLayout="dense"
                    onRowClick={(contact) => {
                      const kind = contactPublicInfoKind(contact);
                      if (kind) openPublicInfo(kind, contact.contact_id);
                    }}
                    rowClickable={(contact) => contactPublicInfoKind(contact) !== null}
                  />
                )}
              </Panel>
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}
