import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CachedNotice,
  EmptyState,
  LoadFailedState,
  Spinner,
  TabPanel,
  Toast,
} from '@/components/ui';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import { AttentionStrip } from '@/features/miningTax/AttentionStrip';
import { AutoAssignmentBar } from '@/features/miningTax/AutoAssignmentBar';
import { CorpBookSyncNote } from '@/features/miningTax/corpBook/CorpBookSyncNote';
import { LeftCorpNotices } from '@/features/miningTax/corpBook/LeftCorpNotice';
import {
  noticeKey,
  notPayingDayKey,
  parseNotPayingKey,
} from '@/features/miningTax/corpBook/resolve/notPaying';
import { useNotPaying } from '@/features/miningTax/corpBook/resolve/notPaying';
import { QuietStatusLine } from '@/features/miningTax/corpBook/resolve/QuietStatusLine';
import { conflictTarget, uncreditedTarget } from '@/features/miningTax/corpBook/resolve/targets';
import { useResolve } from '@/features/miningTax/corpBook/resolve/useResolve';
import type { BookRowView } from '@/engine/corpTaxBook/personal';
import { heldPaymentKeys, type PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { leftCorpBooksOf } from '@/features/miningTax/corpBook/leftCorpBooks';
import {
  corporationOfPayee,
  isBookRow,
  corpPayeeId,
  isCorpPayeeId,
} from '@/features/miningTax/corpBook/corpRows';
import { unlinkedSentFor } from '@/features/miningTax/paymentLinks';
import { PendingGroupingNotice } from '@/features/miningTax/corpBook/PendingGroupingNotice';
import {
  useCorpStateHint,
  useCorpStateLabel,
} from '@/features/miningTax/corpBook/useCorpStateText';
import { splitLedger } from '@/features/miningTax/ledgerSections';
import { OwedBalances } from '@/features/miningTax/OwedBalances';
import {
  conflictSiblings,
  summarizeConflicts,
} from '@/features/miningTax/corpBook/conflictSummary';
import { planTakeover } from '@/features/miningTax/corpBook/conflictTakeover';
import { releaseOre, restoreAssignments } from '@/features/miningTax/ledgerActions';
import { TaxDialogsHost } from '@/features/miningTax/TaxDialogsHost';
import { dateRangeOf, taxOwedOf } from '@/features/miningTax/taxRowFormat';
import { useContinuations } from '@/features/miningTax/useContinuations';
import { useTaxDialogs, useTaxDialogSelector } from '@/features/miningTax/useTaxDialogs';
import { NO_NAMES } from '@/lib/emptyCollections';
import type { MoonMiningTaxRow } from '@/features/miningTax/snapshot';
import { useHydratedStore } from '@/lib/useHydratedStore';
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
import { useEntryDeepLink } from './useEntryDeepLink';
import { useTaxAttentionItems } from './useTaxAttentionItems';
import { useUnheldCharacterItems } from './corpBook/useUnheldCharacterItems';
import { useAutoLinkPayees } from './payeeAutoLink';
import { useTaxBalances } from './useTaxBalances';
import { bookCreditsOf, bookDaysOf, bookOwesOf } from './owedNow';
import { corpPayAccounts, readsEveryDivision } from './corpBook/corpPayAccount';
import { sum } from '@/engine/math';
import { useTaxCorpBooks } from './useTaxCorpBooks';
import { useTaxLedgerActions } from './useTaxLedgerActions';
import { useTaxPayeeNames } from './useTaxPayeeNames';
import { useTaxPayeeManager } from './useTaxPayeeManager';
import { useTaxPayees } from './useTaxPayees';
import { useTaxPricing } from './useTaxPricing';
import { useTaxRowInteractions } from './useTaxRowInteractions';
import { useTaxRows } from './useTaxRows';
import { useTaxSelection } from './useTaxSelection';
import { useTaxTables } from './useTaxTables';
import { useTaxUrlFilters } from './useTaxUrlFilters';

const NO_ENTRIES: readonly MoonMiningTaxRow[] = [];

interface TaxTabProps {
  tabBar: ReactNode;
  tabsId: string;
}

const NO_LINKS: readonly PayeePaymentLink[] = [];

export function TaxTab({ tabBar, tabsId }: TaxTabProps) {
  const { t } = useTranslation();
  const isPhone = useIsPhone();
  const showOreColumn = useMediaQuery('(min-width: 87.5rem)');
  const showValueColumn = useMediaQuery('(min-width: 64rem)') || isPhone;
  const { data, error, loading, activeCharacterId, refresh } = useRouteSnapshot(
    loadTaxSnapshot,
    undefined,
    { cacheKey: 'moonMiningTax' }
  );
  useRefreshOnOreFormChange(refresh);

  const { characterFilter, payeeFilter, setCharacterFilter, setPayeeFilter } = useTaxUrlFilters();
  const [oreTagsOpen, setOreTagsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { store, actions } = useTaxDialogs();
  const acting = useTaxDialogSelector(store, (state) => state.acting);
  const [toast, setToast] = useState<{ message: string; onUndo?: () => void } | null>(null);

  const characters = useMemo(() => data?.characters ?? [], [data]);
  const characterIds = useMemo(() => characters.map((c) => c.characterId), [characters]);
  const characterNames = useMemo(
    () => new Map(characters.map((c) => [c.characterId, c.characterName])),
    [characters]
  );

  const {
    accounts: bookAccounts,
    ledger,
    madePayments,
    paymentSources,
    corpView,
    booksKnown,
    bookOwnerOf,
    reloadCorpBooks,
    leftCorp,
    failedClaims,
    recordChanges,
    systemNames,
    systemSecurity,
  } = useTaxCorpBooks(data, characters, activeCharacterId, refresh);
  const bookCorporations = useMemo(
    () =>
      corpView?.books.map((b) => ({
        corporationId: b.loaded.corporationId,
        name: b.corpName,
        credit: b.summary.credit,
      })) ?? [],
    [corpView]
  );
  const corpStateLabel = useCorpStateLabel();
  const corpStateHint = useCorpStateHint();

  const resolvedCharacterFilter = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const { allDisplayRows, personalRows, characterFiltered } = useTaxRows(
    ledger,
    corpView,
    characters,
    resolvedCharacterFilter
  );
  const bookCredits = useMemo(
    () => bookCreditsOf(corpView, resolvedCharacterFilter),
    [corpView, resolvedCharacterFilter]
  );
  const bookOwes = useMemo(
    () => bookOwesOf(corpView, resolvedCharacterFilter),
    [corpView, resolvedCharacterFilter]
  );
  const bookDays = useMemo(
    () => bookDaysOf(corpView, resolvedCharacterFilter),
    [corpView, resolvedCharacterFilter]
  );
  useHydratedStore(useSurveyPayeeId);
  useEntryDeepLink(Boolean(data), allDisplayRows, loading, actions.openDetail);

  const { allPayees, payeeById, duplicateAliases, ledgerPayees, filterPayees, payeeAliases } =
    useTaxPayees(data, corpView);
  const {
    payeeManagerCharacterId,
    openPayeeManager,
    closePayeeManager,
    needsFirstPayee,
    onAddPayee,
    canManagePayees,
    payeesInline,
  } = useTaxPayeeManager(Boolean(data), characters, activeCharacterId, allPayees, corpView);
  const unlinkedPayees = useAutoLinkPayees(allPayees, refresh);
  const datedPrices = data?.datedPrices ?? EMPTY_DATED_PRICES;
  const { pricesFor, priceSourcesFor, estimatedValueOf, systemName, systemSecurityOf } =
    useTaxPricing(datedPrices, systemNames, systemSecurity);
  const { payeeName, payeeDisplayName, settleUpRowsFor } = useTaxPayeeNames(
    ledgerPayees,
    payeeById
  );

  const { resolvedPayeeFilter, togglePayee } = usePayeeFilter(
    payeeFilter,
    setPayeeFilter,
    filterPayees,
    payeeAliases
  );
  const visibleRows = useMemo(
    () => filterRowsByPayee(characterFiltered, resolvedPayeeFilter, payeeAliases),
    [characterFiltered, resolvedPayeeFilter, payeeAliases]
  );

  const { hidden: notPayingKeys } = useNotPaying();
  const conflicts = useMemo(
    () => summarizeConflicts(characterFiltered, notPayingKeys),
    [characterFiltered, notPayingKeys]
  );
  const quietUncredited = useCallback(
    (b: NonNullable<typeof corpView>['books'][number]) => {
      const group = b.summary.uncredited
        .filter(
          (d) => resolvedCharacterFilter === 'all' || resolvedCharacterFilter.has(d.characterId)
        )
        .map((d) => ({ ...d, corporationId: b.loaded.corporationId, corpName: b.corpName }));
      if (group.length === 0) return false;
      const target = uncreditedTarget(group, corpView?.overlay.rows ?? []);
      return target.answered === true || notPayingKeys.has(target.hideKey);
    },
    [corpView, resolvedCharacterFilter, notPayingKeys]
  );
  const uncreditedByCorp = useMemo(
    () =>
      new Map(
        corpView?.books.map((b) => [
          b.loaded.corporationId,
          {
            amount: sum(
              quietUncredited(b)
                ? []
                : b.summary.uncredited
                    .filter(
                      (d) =>
                        resolvedCharacterFilter === 'all' ||
                        resolvedCharacterFilter.has(d.characterId)
                    )
                    .map((d) => d.amount)
            ),
            accounts: corpPayAccounts(b.loaded.divisions, b.loaded.divisionNames, t).join(', '),
            everyDivision: readsEveryDivision(b.loaded.divisions),
          },
        ]) ?? []
      ),
    [corpView, resolvedCharacterFilter, t, quietUncredited]
  );
  const bookCorporationIds = useMemo(
    () => new Set(corpView?.books.map((b) => b.loaded.corporationId) ?? []),
    [corpView]
  );
  const {
    accounts,
    balances,
    unassigned,
    everyAssignment,
    linkSuggestions,
    payeeSystems,
    owedByPayee,
  } = useTaxBalances({
    characterFiltered,
    personalRows,
    ledgerPayees,
    allPayees,
    duplicateAliases,
    estimatedValueOf,
    madePayments,
    links: data?.paymentLinks ?? NO_LINKS,
    accounts: bookAccounts,
    bookCorporations: bookCorporationIds,
    bookCredits,
    bookOwes,
    bookDays,
  });

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

  const linkable = linkSuggestions;

  const openBookDay = useCallback(
    (row: BookRowView) => {
      const target = allDisplayRows.find(
        (dr) => dr.corp?.kind === 'row' && dr.corp.view.id === row.id
      );
      if (target) actions.openDetail(target);
    },
    [allDisplayRows, actions]
  );
  const takeoverOf = useCallback(
    (row: BookRowView) =>
      planTakeover(
        row,
        corpView ? conflictSiblings(corpView.overlay.rows, row) : [],
        everyAssignment
      ),
    [corpView, everyAssignment]
  );
  const fixConflict = useCallback(
    async (row: BookRowView) => {
      const { steps } = takeoverOf(row);
      if (steps.length === 0) return openBookDay(row);
      const result = await releaseOre(
        steps.map((step) => ({ assignment: step.assignment, after: step.after }))
      );
      if (!result.ok) return setToast({ message: t('miningTax.saveFailed') });
      const originals = steps.map((step) => step.assignment);
      refresh();
      setToast({
        message: t('miningTax.corpBook.conflict.fixedToast', {
          corp: row.corpName,
          date: row.date,
        }),
        onUndo: () => void restoreAssignments(originals).then(() => refresh()),
      });
    },
    [takeoverOf, openBookDay, refresh, t]
  );
  const quickFix = useMemo(() => {
    const first = conflicts?.first.corp;
    if (conflicts?.days !== 1 || first?.kind !== 'row') return undefined;
    return takeoverOf(first.view).steps.length > 0 ? first.view : undefined;
  }, [conflicts, takeoverOf]);
  const linkedKeys = useMemo(
    () => heldPaymentKeys(data?.paymentLinks ?? NO_LINKS),
    [data?.paymentLinks]
  );
  const resolve = useResolve({
    corpView,
    nameOf: (id) => characterNames.get(id) ?? '',
    reloadCorpBooks,
    madePayments,
    linked: linkedKeys,
    onPay: actions.openCorpPay,
    onOpenDay: fixConflict,
  });
  const quiet = useMemo(() => {
    const rows = corpView?.overlay.rows ?? [];
    const waiting = new Set([
      ...rows
        .filter((r) => r.flagged?.state === 'sent')
        .map((r) => notPayingDayKey(r.corporationId, r.characterId, r.date)),
      ...rows
        .filter((r) => r.declaration?.state === 'waiting' && r.noticeId !== undefined)
        .map((r) => noticeKey(r.corporationId, r.noticeId!)),
    ]).size;
    const notPaying = [...resolve.hidden].sort().flatMap((key) => {
      const parsed = parseNotPayingKey(key);
      if (!parsed) return [];
      const corp = leftCorp.corpNameOf(parsed.corporationId);
      return [
        {
          key,
          label:
            parsed.kind === 'day'
              ? t('miningTax.resolve.quiet.dayLabel', { corp, date: parsed.date })
              : t(`miningTax.resolve.quiet.${parsed.kind}Label`, { corp }),
        },
      ];
    });
    return { waiting, notPaying };
  }, [corpView, resolve.hidden, t, leftCorp]);

  const unheldItems = useUnheldCharacterItems(corpView, characterIds, reloadCorpBooks);
  const taxAttentionItems = useTaxAttentionItems({
    data: ledger,
    resolvedCharacterFilter,
    personalRows,
    displayRows: characterFiltered,
    payeeById,
    unlinkedPayees,
    openPayeeManager,
    corpView,
    failedClaims,
    reloadCorpBooks,
    systemName,
    systemNames,
    refresh,
    openDetail: actions.openDetail,
    openUnassign: actions.confirmUnassignFor,
    resolve,
  });
  const attentionItems = useMemo(
    () => [...unheldItems, ...taxAttentionItems],
    [unheldItems, taxAttentionItems]
  );

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
  const {
    showCharacterColumn,
    allColumns,
    openColumns,
    historyColumns,
    taxSort,
    historySort,
    taxExport,
  } = useTaxTables({
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

  const leftCorpBooks = useMemo(
    () =>
      leftCorpBooksOf(
        leftCorp.shownBooks,
        leftCorp.corpNameOf,
        (id) => balances.find((b) => b.payee.id === corpPayeeId(id))?.owed ?? 0
      ),
    [leftCorp, balances]
  );

  const corpOwedNow = useCallback(
    (corporationId: number) =>
      characterFiltered
        .filter((dr) => dr.corp?.kind === 'row' && dr.corp.view.corporationId === corporationId)
        .reduce((sum, dr) => sum + (dr.status === 'outstanding' ? taxOwedOf(dr) : 0), 0),
    [characterFiltered]
  );

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
        onManagePayees={openPayeeManager}
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
          <LoadFailedState title={t('common.loadFailed.tax')} onRetry={refresh} />
        ) : (
          <>
            {data && data.fromCache && <CachedNotice fetchedAt={data.fetchedAt} />}

            <AttentionStrip items={attentionItems} />
            <QuietStatusLine
              waiting={quiet.waiting}
              notPaying={quiet.notPaying}
              onShow={resolve.show}
            />
            {resolve.dialog}

            <LeftCorpNotices
              books={leftCorpBooks}
              hidden={leftCorp.hiddenLeft}
              onPay={actions.openCorpPay}
              onStopShowing={leftCorp.hide}
              onShow={leftCorp.show}
            />

            <AutoAssignmentBar
              characterIds={characterIds}
              characterNames={characterNames}
              systemNames={systemNames}
            />

            {needsFirstPayee ? (
              <EmptyState
                title={t('miningTax.firstPayeeTitle')}
                hint={t('miningTax.firstPayeeHint')}
              />
            ) : (
              <>
                {!booksKnown ? (
                  <Spinner block="panel" label={t('common.loading')} />
                ) : (
                  <OwedBalances
                    balances={balances}
                    unassigned={unassigned}
                    unlinkedPaymentCount={linkable.length}
                    characterNameOf={
                      characters.length > 1
                        ? (balance) =>
                            characters.find((c) => c.characterId === balance.payee.characterId)
                              ?.characterName
                        : undefined
                    }
                    onSettleUp={(balance) =>
                      isCorpPayeeId(balance.payee.id)
                        ? actions.openCorpPay(corporationOfPayee(balance.payee.id))
                        : settleUpBalance(balance.members)
                    }
                    onLinkPayment={(balance) =>
                      actions.openLinkPayment({ payeeId: balance.payee.id })
                    }
                    onOpenLedger={(balance) =>
                      actions.openLedger(
                        isCorpPayeeId(balance.payee.id)
                          ? { kind: 'book', corporationId: corporationOfPayee(balance.payee.id) }
                          : { kind: 'personal', payeeId: balance.payee.id }
                      )
                    }
                    hideLinkPayment={(balance) => isCorpPayeeId(balance.payee.id)}
                    uncreditedOf={(balance) =>
                      isCorpPayeeId(balance.payee.id)
                        ? uncreditedByCorp.get(corporationOfPayee(balance.payee.id))
                        : undefined
                    }
                    unlinkedOf={(balance) => unlinkedSentFor(linkable, balance.payee.id)}
                    onAssignNext={assignNext}
                    onReviewPayments={() => actions.openLinkPayment({})}
                    conflicts={conflicts}
                    {...(quickFix ? { onFixConflicts: () => void fixConflict(quickFix) } : {})}
                    onReviewConflicts={() => {
                      const first = conflicts?.first.corp;
                      if (first?.kind !== 'row') return;
                      const payeeId = first.view.overlap?.payeeIds[0];
                      resolve.open(
                        conflictTarget(
                          first.view,
                          payeeId !== undefined ? payeeById.get(payeeId)?.name : undefined
                        )
                      );
                    }}
                  />
                )}

                {data && <PendingGroupingNotice characters={characters} />}

                {corpView?.books.map((book) => (
                  <CorpBookSyncNote
                    key={book.loaded.corporationId}
                    book={book}
                    owedNow={corpOwedNow(book.loaded.corporationId)}
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
                  ledgerPayees={filterPayees}
                  characters={characters}
                  resolvedPayeeFilter={resolvedPayeeFilter}
                  onPayeeFilterChange={setPayeeFilter}
                  onTogglePayee={togglePayee}
                  isPhone={isPhone}
                  visibleRows={visibleRows}
                  openRows={openRows}
                  openColumns={openColumns}
                  allColumns={allColumns}
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
          onClosePayeeManager={closePayeeManager}
          characters={characters}
          payeesByCharacter={data?.payeesByCharacter}
          owedByPayee={owedByPayee}
          systemsByPayee={payeeSystems}
          systemNames={systemNames}
          bookCorporations={bookCorporations}
          accountOf={(id) => accounts.of(id)}
          isArchived={(id) => accounts.isArchived(id)}
          bookOwnerOf={bookOwnerOf}
          onOpenLedger={(payeeId) => {
            closePayeeManager();
            actions.openLedger({ kind: 'personal', payeeId });
          }}
          refresh={refresh}
        />

        <TaxDialogsHost
          entries={ledger?.entries ?? NO_ENTRIES}
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
          allDisplayRows={allDisplayRows}
          characterFiltered={characterFiltered}
          everyAssignment={everyAssignment}
          accounts={accounts}
          links={data?.paymentLinks ?? NO_LINKS}
          bookCorporations={bookCorporationIds}
          activeCharacterId={activeCharacterId}
          allPayees={allPayees}
          duplicateAliases={duplicateAliases}
          payeeById={payeeById}
          balances={balances}
          madePayments={madePayments}
          paymentSources={paymentSources}
          linkSuggestions={linkSuggestions}
          corpView={corpView}
          recordChanges={recordChanges}
          reloadCorpBooks={reloadCorpBooks}
          onResolve={resolve.open}
          corpStateHint={corpStateHint}
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
          onToast={(message, onUndo) =>
            setToast({
              message,
              ...(onUndo
                ? {
                    onUndo: () => {
                      setToast(null);
                      onUndo();
                    },
                  }
                : {}),
            })
          }
        />
      </TabPanel>
    </div>
  );
}
