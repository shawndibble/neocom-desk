import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CachedNotice, EmptyState, Spinner, TabPanel, Toast } from '@/components/ui';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import { AttentionStrip } from '@/features/miningTax/AttentionStrip';
import { AutoAssignmentBar } from '@/features/miningTax/AutoAssignmentBar';
import { CorpBookSyncNote } from '@/features/miningTax/corpBook/CorpBookSyncNote';
import {
  corporationOfPayee,
  isBookRow,
  isCorpPayeeId,
} from '@/features/miningTax/corpBook/corpRows';
import { PendingGroupingNotice } from '@/features/miningTax/corpBook/PendingGroupingNotice';
import {
  useCorpStateHint,
  useCorpStateLabel,
} from '@/features/miningTax/corpBook/useCorpStateText';
import { splitLedger } from '@/features/miningTax/ledgerSections';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
import { TaxDialogsHost } from '@/features/miningTax/TaxDialogsHost';
import { dateRangeOf, taxOwedOf } from '@/features/miningTax/taxRowFormat';
import { useContinuations } from '@/features/miningTax/useContinuations';
import { useTaxDialogs, useTaxDialogSelector } from '@/features/miningTax/useTaxDialogs';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useIsNarrow } from '@/lib/useIsNarrow';
import { useIsPhone } from '@/lib/useIsPhone';
import { useMediaQuery } from '@/lib/useMediaQuery';
import { useRouteSnapshot } from '@/lib/useRouteSnapshot';
import { useRefreshOnOreFormChange } from './oreForm';
import { filterRowsByPayee } from './payeeFilter';
import { useSurveyPayeeId } from './surveyPayeePref';
import { EMPTY_DATED_PRICES, loadTaxSnapshot } from './taxSnapshot';
import { ContinueSessionCards } from './ContinueSessionCards';
import { TaxHeader } from './TaxHeader';
import { TaxHistoryLedger, TaxOpenLedger } from './TaxLedgerTables';
import { TaxPageDialogs } from './TaxPageDialogs';
import { TaxSelectionBar } from './TaxSelectionBar';
import { usePayeeFilter } from './usePayeeFilter';
import { usePaymentRefDeepLink } from './usePaymentRefDeepLink';
import { useTaxAttentionItems } from './useTaxAttentionItems';
import { useTaxBalances } from './useTaxBalances';
import { useTaxCorpBooks } from './useTaxCorpBooks';
import { useTaxLedgerActions } from './useTaxLedgerActions';
import { useTaxPayeeNames } from './useTaxPayeeNames';
import { useTaxPayees } from './useTaxPayees';
import { useTaxPricing } from './useTaxPricing';
import { useTaxRowInteractions } from './useTaxRowInteractions';
import { useTaxRows } from './useTaxRows';
import { useTaxSelection } from './useTaxSelection';
import { useTaxTables } from './useTaxTables';
import { useTaxUrlFilters } from './useTaxUrlFilters';

/**
 * Moon Mining ledger (issue #523): one continuously-filterable list, all
 * tracked characters by default. The Tax tab of the Mining page (issue #671)
 * — the route shell (`src/routes/MoonMiningTax.tsx`) gates on the active
 * Character before mounting this, so a hydrated store and a non-null
 * `activeCharacterId` are already guaranteed here.
 */
interface TaxTabProps {
  /** The route's shared tab bar, rendered under this tab's own `PageHeader`. See `MoonMiningTax`. */
  tabBar: ReactNode;
  /** The id base the tab bar was built with, so the body is its tab panel. */
  tabsId: string;
}

export function TaxTab({ tabBar, tabsId }: TaxTabProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const payeesFit = !useIsNarrow();
  // The Ore column only where the table has room for it beside a full Payee
  // name: the Payee is what a row is read by, the ore is one click away in
  // the entry itself (and at 1024px it pushed Status off-screen, #2147).
  const showOreColumn = useMediaQuery('(min-width: 87.5rem)');
  // Est. value is out between the phone card and `lg`: there the other
  // columns' fixed widths would leave the Payee column no room at all. The
  // card still shows it, and so does every wider screen (and the export).
  const showValueColumn = useMediaQuery('(min-width: 64rem)') || isPhone;
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadTaxSnapshot,
    undefined,
    { cacheKey: 'moonMiningTax' }
  );
  useRefreshOnOreFormChange(refresh);

  const { characterFilter, payeeFilter, setCharacterFilter, setPayeeFilter } = useTaxUrlFilters();
  const [payeeManagerCharacterId, setPayeeManagerCharacterId] = useState<number | null>(null);
  // Unconditional, deliberately. Hiding this behind "the pilot has at least
  // one tag" reads tidier and reintroduces the shape of the bug it exists to
  // fix: the check can only re-run when `data`'s identity changes, and a
  // reload that *fails* after a successful tag leaves `data` on the retained
  // snapshot — so the action would stay hidden while the error branch has
  // already taken the banner away, stranding the pilot exactly as before. The
  // dialog says so itself when there is nothing to show.
  const [oreTagsOpen, setOreTagsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  // The dialogs' targets live in a store the dialogs host subscribes to, so
  // opening or closing one re-renders the host and not the tables (`useTaxDialogs`).
  const { store, actions } = useTaxDialogs();
  const acting = useTaxDialogSelector(store, (state) => state.acting);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

  // Every tracked character, not just those with a Mining Ledger Entry this
  // refresh (GLOSSARY.md: the point of the feature is not missing an alt's
  // obligation) — a character with nothing mined yet still needs to appear
  // in the Characters filter and in Manage Payees.
  const characters = useMemo(() => data?.characters ?? [], [data]);
  // The Characters the ledger tracks, which can be fewer than the roster: the
  // picker's faces and "+N" follow them, matching its "· N".
  const characterIds = useMemo(() => characters.map((c) => c.characterId), [characters]);
  const characterNames = useMemo(
    () => new Map(characters.map((c) => [c.characterId, c.characterName])),
    [characters]
  );

  const {
    madePayments,
    paymentSources,
    corpView,
    reloadCorpBooks,
    failedClaims,
    systemNames,
    systemSecurity,
  } = useTaxCorpBooks(data, characters, activeCharacterId);
  const corpStateLabel = useCorpStateLabel();
  const corpStateHint = useCorpStateHint();

  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const { allDisplayRows, personalRows, characterFiltered } = useTaxRows(
    data,
    corpView,
    characters,
    resolvedCharacterFilter
  );
  // Read by the Assign dialog when it opens, long after this has hydrated.
  useHydratedStore(useSurveyPayeeId);
  usePaymentRefDeepLink(Boolean(data), allDisplayRows, loading, actions.openDetail);

  const { allPayees, payeeById, ledgerPayees } = useTaxPayees(data, corpView);
  const datedPrices = data?.datedPrices ?? EMPTY_DATED_PRICES;
  const { pricesFor, priceSourcesFor, estimatedValueOf, systemName, systemSecurityOf } =
    useTaxPricing(datedPrices, systemNames, systemSecurity);
  const { payeeName, payeeDisplayName, settleUpRowsFor } = useTaxPayeeNames(
    ledgerPayees,
    payeeById
  );

  const { resolvedPayeeFilter, togglePayee, isSolePayee, filterToPayee } = usePayeeFilter(
    payeeFilter,
    setPayeeFilter,
    ledgerPayees
  );
  const visibleRows = useMemo(
    () => filterRowsByPayee(characterFiltered, resolvedPayeeFilter),
    [characterFiltered, resolvedPayeeFilter]
  );

  const { balances, unassigned, everyAssignment, linkSuggestions, payeeSystems, owedByPayee } =
    useTaxBalances({
      characterFiltered,
      personalRows,
      ledgerPayees,
      allPayees,
      estimatedValueOf,
      madePayments,
    });

  // A Corp Tax Book row is the corp's to continue, not the member's.
  const continuationRows = useMemo(
    () => characterFiltered.filter((dr) => !isBookRow(dr)),
    [characterFiltered]
  );
  const {
    continuations,
    continuing,
    autoContinue,
    autoSkip,
    handleContinue,
    keepSeparate,
    setAutoContinueFromCard,
  } = useContinuations({
    hasData: Boolean(data),
    rows: continuationRows,
    allDisplayRows,
    payeeById,
    pricesFor,
    refresh,
    setToast,
  });
  const busy = continuing || acting;

  const { openSettleUpFor, settleUpBalance, assignNext } = useTaxLedgerActions(
    actions,
    activeCharacterId,
    characterFiltered,
    settleUpRowsFor
  );

  const attentionItems = useTaxAttentionItems({
    data,
    resolvedCharacterFilter,
    personalRows,
    payeeById,
    corpView,
    failedClaims,
    reloadCorpBooks,
    systemName,
    systemNames,
    refresh,
    openDetail: actions.openDetail,
  });

  const { open: openRows, history } = useMemo(
    () => splitLedger(visibleRows, (dr) => dateRangeOf(dr).at(-1) ?? dr.row.entry.date),
    [visibleRows]
  );
  const historyRows = useMemo(() => history.flatMap((month) => month.rows), [history]);

  const selection = useTaxSelection(openRows, settleUpRowsFor, actions);
  const { expandedCombined, toggleCombinedExpanded, rowProps } = useTaxRowInteractions(
    systemName,
    actions
  );
  const { showCharacterColumn, openColumns, historyColumns, taxSort, historySort, taxExport } =
    useTaxTables({
      visibleRows,
      isPhone,
      showOreColumn,
      showValueColumn,
      showSelectColumn: selection.selectableVisible.length > 0,
      typeNames: data?.typeNames,
      systemSecurity,
      selection: selection.selection,
      expandedCombined,
      toggleRowSelected: selection.toggleRowSelected,
      toggleCombinedExpanded,
      estimatedValueOf,
      systemName,
      payeeDisplayName,
      corpStateLabel,
    });

  const payeeManagerDefaultCharacterId =
    characters.find((c) => c.characterId === activeCharacterId)?.characterId ??
    characters[0]?.characterId ??
    null;

  // A corp's book is something to owe on its own: a member with no Payee of their own yet still
  // sees what the book billed.
  const needsFirstPayee =
    data != null &&
    allPayees.length === 0 &&
    !(corpView && corpView.overlay.rows.length > 0) &&
    payeeManagerDefaultCharacterId !== null;

  /** What a book's rows owe the member right now (its Billed days). */
  const corpOwedNow = useCallback(
    (corporationId: number) =>
      characterFiltered
        .filter((dr) => dr.corp?.kind === 'row' && dr.corp.view.corporationId === corporationId)
        .reduce((sum, dr) => sum + (dr.status === 'outstanding' ? taxOwedOf(dr) : 0), 0),
    [characterFiltered]
  );

  const onAddPayee = useMemo(
    () =>
      payeeManagerDefaultCharacterId !== null
        ? () => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)
        : undefined,
    [payeeManagerDefaultCharacterId]
  );

  // The header row never wraps (it has a picker): below `md` Payees moves
  // into the ⋮, except as the accent first-run call to action, which is the
  // one control an empty tab is waiting on and so stays in sight.
  const canManagePayees = payeeManagerDefaultCharacterId !== null;
  const payeesInline = canManagePayees && (payeesFit || needsFirstPayee);

  return (
    <div className="space-y-4">
      <TaxHeader
        fetchedAt={data?.fetchedAt}
        needsFirstPayee={needsFirstPayee}
        activeCharacterId={activeCharacterId}
        characterFilter={characterFilter}
        onCharacterFilterChange={setCharacterFilter}
        characterIds={characterIds}
        canManagePayees={canManagePayees}
        payeesInline={payeesInline}
        onManagePayees={() => setPayeeManagerCharacterId(payeeManagerDefaultCharacterId)}
        onRefresh={refresh}
        loading={loading}
        onOpenOreTags={() => setOreTagsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {tabBar}
      <TabPanel tabsId={tabsId} tabId="tax" className="space-y-4">
        {loading && !data ? (
          <Spinner block="page" label={t('common.loading')} />
        ) : error ? (
          <EmptyState title={t('common.loadFailedTitle')} hint={t('common.loadFailedHint')} />
        ) : (
          <>
            {data && data.fromCache && <CachedNotice fetchedAt={data.fetchedAt} />}

            <AttentionStrip items={attentionItems} />

            <AutoAssignmentBar
              characterIds={characterIds}
              characterNames={characterNames}
              systemNames={systemNames}
            />

            {/* Until a Payee exists there is nothing to assign an entry to, so
              the balances and ledger would all read as blank. Point at the
              Payees button (outlined in accent while this shows) instead. */}
            {needsFirstPayee ? (
              <EmptyState
                title={t('miningTax.firstPayeeTitle')}
                hint={t('miningTax.firstPayeeHint')}
              />
            ) : (
              <>
                <OwedBalances
                  balances={balances}
                  unassigned={unassigned}
                  unlinkedPaymentCount={linkSuggestions.length}
                  characterNameOf={
                    characters.length > 1
                      ? (balance) =>
                          characters.find((c) => c.characterId === balance.payee.characterId)
                            ?.characterName
                      : undefined
                  }
                  isSoleFilter={isSolePayee}
                  onFilterPayee={filterToPayee}
                  onSettleUp={(balance) =>
                    isCorpPayeeId(balance.payee.id)
                      ? actions.openCorpPay(corporationOfPayee(balance.payee.id))
                      : settleUpBalance(balance.members)
                  }
                  onLinkPayment={(balance) => actions.openLinkWallet({ payeeId: balance.payee.id })}
                  hideLinkPayment={(balance) => isCorpPayeeId(balance.payee.id)}
                  onAssignNext={assignNext}
                  onReviewPayments={() => actions.openLinkPayment(true)}
                />

                {data && <PendingGroupingNotice characters={characters} />}

                {corpView?.books.map((book) => (
                  <CorpBookSyncNote
                    key={book.loaded.corporationId}
                    book={book}
                    owedNow={corpOwedNow(book.loaded.corporationId)}
                    showCredit={false}
                  />
                ))}

                {data && (
                  <ContinueSessionCards
                    continuations={continuations}
                    autoContinue={autoContinue}
                    autoSkip={autoSkip}
                    typeNames={data.typeNames}
                    busy={busy}
                    systemName={systemName}
                    payeeName={payeeName}
                    onContinue={(c) => void handleContinue(c)}
                    onChooseOther={actions.openDetail}
                    onKeepSeparate={keepSeparate}
                    onAutoContinueChange={setAutoContinueFromCard}
                  />
                )}

                <TaxOpenLedger
                  ledgerPayees={ledgerPayees}
                  characters={characters}
                  resolvedPayeeFilter={resolvedPayeeFilter}
                  onPayeeFilterChange={setPayeeFilter}
                  onTogglePayee={togglePayee}
                  isPhone={isPhone}
                  visibleRows={visibleRows}
                  openRows={openRows}
                  openColumns={openColumns}
                  taxSort={taxSort}
                  taxExport={taxExport}
                  rowProps={rowProps}
                />

                {historyRows.length > 0 && (
                  <TaxHistoryLedger
                    historyRows={historyRows}
                    history={history}
                    historyColumns={historyColumns}
                    historySort={historySort}
                    rowProps={rowProps}
                  />
                )}

                {resolvedPayeeFilter === 'none' ? (
                  <EmptyState title={t('miningTax.noPayeesSelected')} />
                ) : (
                  visibleRows.length === 0 && (
                    <EmptyState title={t('miningTax.emptyTitle')} hint={t('miningTax.emptyHint')} />
                  )
                )}

                {selection.selectedRows.length > 0 && (
                  <TaxSelectionBar
                    toolbarRef={selection.toolbarRef}
                    selectedRows={selection.selectedRows}
                    selectableVisible={selection.selectableVisible}
                    selection={selection.selection}
                    onSelectAll={selection.setSelection}
                    onClear={selection.clearSelection}
                    selectedSettleUpRows={selection.selectedSettleUpRows}
                    onSettleUp={openSettleUpFor}
                    combine={selection.combine}
                    onCombine={selection.handleCombineSelected}
                    dismissCount={selection.dismissTargets.length}
                    selectedPayeeIds={selection.selectedPayeeIds}
                    linkSelectedBlocked={selection.linkSelectedBlocked}
                    actions={actions}
                  />
                )}
              </>
            )}
          </>
        )}

        {toast && (
          <Toast
            message={toast.message}
            undo={
              toast.onUndo
                ? { label: t('miningTax.continue.undo'), onUndo: toast.onUndo }
                : undefined
            }
            onClose={() => setToast(null)}
          />
        )}

        <TaxPageDialogs
          oreTagsOpen={oreTagsOpen}
          onCloseOreTags={() => setOreTagsOpen(false)}
          settingsOpen={settingsOpen}
          onCloseSettings={() => setSettingsOpen(false)}
          onAutoContinueChange={setAutoContinueFromCard}
          payeeManagerCharacterId={payeeManagerCharacterId}
          onClosePayeeManager={() => setPayeeManagerCharacterId(null)}
          characters={characters}
          payeesByCharacter={data?.payeesByCharacter}
          owedByPayee={owedByPayee}
          systemsByPayee={payeeSystems}
          systemNames={systemNames}
          refresh={refresh}
        />

        <TaxDialogsHost
          store={store}
          actions={actions}
          hasData={Boolean(data)}
          typeNames={data?.typeNames ?? NO_NAMES}
          systemNames={systemNames}
          datedPrices={datedPrices}
          unreachableHubs={data?.datedPrices.unreachableHubs}
          refresh={refresh}
          loading={loading}
          continuing={continuing}
          characterCount={characters.length}
          allDisplayRows={allDisplayRows}
          characterFiltered={characterFiltered}
          everyAssignment={everyAssignment}
          allPayees={allPayees}
          payeeById={payeeById}
          balances={balances}
          madePayments={madePayments}
          paymentSources={paymentSources}
          linkSuggestions={linkSuggestions}
          corpView={corpView}
          corpStateHint={corpStateHint}
          corpOwedNow={corpOwedNow}
          dismissTargets={selection.dismissTargets}
          showCharacterColumn={showCharacterColumn}
          estimatedValueOf={estimatedValueOf}
          systemName={systemName}
          systemSecurityOf={systemSecurityOf}
          payeeDisplayName={payeeDisplayName}
          settleUpRowsFor={settleUpRowsFor}
          pricesFor={pricesFor}
          priceSourcesFor={priceSourcesFor}
          onClearSelection={selection.clearSelection}
          onAddPayee={onAddPayee}
          onToast={(message) => setToast({ message })}
        />
      </TabPanel>
    </div>
  );
}
