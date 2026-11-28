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
  LoadFailedState,
  IconButton,
  PageHeader,
  Panel,
  Spinner,
  Tabs,
  TabPanel,
  useTabsId,
  type DataTableColumn,
  CachedNotice,
  IncompleteNotice,
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
  DEFAULT_CONTACT_KINDS,
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
import { TableScroll } from '@/components/ui/TableScroll';

const FILTER_PARAMS = {
  q: textParam(),
  types: enumSetParam(ALL_CONTACT_KINDS, DEFAULT_CONTACT_KINDS),
  standing: enumSetParam(STANDING_CATEGORIES),
  'across.disagree': boolParam(),
};

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
  const rowsFilter = useDeferredValue(filter);
  const setFilter = (next: ContactsFilter) =>
    setFilterParams({ q: next.text, types: next.types, standing: next.standings });
  const [tab, setTab] = usePageTab(CONTACTS_TABS);
  const tabsId = useTabsId();
  const standings = useContactsStandings(activeCharacterId ?? 0, tab === 'standings');
  const { open: openPublicInfo } = usePublicInfoModal();

  const disagreementsOnly = filterParams['across.disagree'];
  const setDisagreementsOnly = (next: boolean) => setFilterParams({ 'across.disagree': next });
  const [disagreementCount, setDisagreementCount] = useState(0);
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

  const [exportArmed, setExportArmed] = useState(false);
  const contacts = useMemo(() => contactsResult?.data ?? [], [contactsResult]);
  const {
    affiliationRows,
    achievements,
    achievementsPending,
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
    exportArmed,
  });

  const counts = useMemo(
    () => ({
      standing: contactCountsByStanding(contacts),
      type: contactCountsByKind(contacts),
    }),
    [contacts]
  );

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

  const view =
    tab === 'across' && (data === undefined || acrossLists.length > 1) ? 'across' : 'character';

  const acrossColumnsById: Record<ContactsAcrossColumnId, DataTableColumn<AcrossCharactersRow>> = {
    type: { id: 'type', header: t('contacts.type'), render: () => null },
    held: { id: 'held', header: t('contacts.acrossCharacters'), render: () => null },
    standings: { id: 'standings', header: t('contacts.acrossStandings'), render: () => null },
  };

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

  const characterCsvColumns = useMemo(
    () => contactsCsvColumns(t, contactNames, affiliationRows, contactLabels, achievements),
    [t, contactNames, affiliationRows, contactLabels, achievements]
  );
  const characterExport = useTableExport({
    surface: 'contacts',
    rows: filteredContacts,
    columns: characterCsvColumns,
    truncated: contactsTruncated || achievementsPending,
    onExportIntent: () => setExportArmed(true),
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
            : contactsResult && (
                <DataAgeBadge
                  date={contactsResult.fetchedAt}
                  expiresAt={contactsResult.expiresAt}
                />
              )
        }
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
                busy={loading}
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
              <GrantBanner characterId={activeCharacterId} endpoints={['getCharacterContacts']} />
            ) : error ? (
              <LoadFailedState title={t('common.loadFailed.contacts')} onRetry={refresh} />
            ) : !contactsResult || contacts.length === 0 ? (
              <CachedEmptyState
                result={contactsResult}
                title={t('contacts.emptyTitle')}
                hint={t('contacts.emptyHint')}
                fetchedTitle={t('contacts.emptyFetchedTitle')}
                fetchedHint={t('contacts.emptyFetchedHint')}
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
                  <CachedNotice
                    withBadge
                    className="px-3 pt-2"
                    fetchedAt={contactsResult.fetchedAt}
                  />
                )}
                {contactsTruncated && <IncompleteNotice className="px-3 pt-2" />}
                {filteredContacts.length === 0 ? (
                  <EmptyState
                    title={t('contacts.noResults')}
                    className="py-8"
                    action={
                      !filter.types.has('npc') && counts.type.npc > 0 ? (
                        <Button
                          size="sm"
                          onClick={() =>
                            setFilter({ ...filter, types: new Set([...filter.types, 'npc']) })
                          }
                        >
                          {t('contacts.showNpcs')}
                        </Button>
                      ) : activeContactsFilterCount(filter) > 0 ? (
                        <Button size="sm" onClick={() => setFilter(EMPTY_CONTACTS_FILTER)}>
                          {t('common.resetFilters')}
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <TableScroll>
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
                  </TableScroll>
                )}
              </Panel>
            )}
          </>
        )}
      </TabPanel>
    </div>
  );
}
