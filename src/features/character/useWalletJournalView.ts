import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import type { JournalRow } from '@/engine/journalNetting';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useUrlFilter, useUrlSort } from '@/lib/useUrlState';
import { useTableExport } from '@/components/ui/useTableExport';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { miningTaxPaymentHref } from '@/features/miningTax/paymentDeepLink';
import { linkedRefIds } from '@/features/miningTax/paymentLinks';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import { classifyJournal, journalCoverage, type JournalLine } from '@/engine/journalNetting';
import {
  loadAllCharactersJournals,
  loadWalletScopedCharacterIds,
  type AllJournalsSnapshot,
} from '@/features/character/walletJournalAll';
import { journalTransactionLinks } from '@/features/character/journalTransactionLink';
import {
  EMPTY_JOURNAL_FILTER_PARAMS,
  JOURNAL_FIELD_TO_PARAM,
  JOURNAL_FILTER_PARAMS,
  type WalletJournalFilter,
} from '@/features/character/walletJournalFilter';
import {
  JOURNAL_SORT,
  JOURNAL_SORT_COLUMN_IDS,
  typeNameLookup,
  useJournalColumnsBuilder,
  useJournalFilterResult,
} from '@/features/character/walletJournal';
import {
  EMPTY_FILLS,
  EMPTY_JOURNAL,
  loadPersonalFills,
  type PersonalFillsSnapshot,
} from '@/features/character/walletSnapshot';
import type { NetWorthCharacter } from '@/features/netWorth/NetWorthPanel';
import type { CachedResult } from '@/esi/cache';
import type { WalletJournalEntry, WalletTransactionCommon } from '@/esi/endpoints';

interface WalletJournalViewInput {
  /** The Journal tab is open: the item-name fills and the fanned-out journals load only then. */
  journalOpen: boolean;
  activeCharacterId: number | null;
  /** The `?char=` pick reaches beyond the active Character. */
  showingBeyondActive: boolean;
  /** The Characters that pick resolves to. */
  pickedCharacters: NetWorthCharacter[];
  allCharacters: readonly NetWorthCharacter[];
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journalNeedsReauth: boolean;
  journalTruncated: boolean;
}

/**
 * Everything the Wallet Journal tab shows, assembled from the active
 * Character's journal or every picked Character's: the netted rows, their
 * columns, URL filter and sort, the item-name fills behind the description
 * links, coverage and export. `panel` is `WalletJournalPanel`'s data props.
 */
export function useWalletJournalView({
  journalOpen,
  activeCharacterId,
  showingBeyondActive,
  pickedCharacters,
  allCharacters,
  journalResult,
  journalNeedsReauth,
  journalTruncated,
}: WalletJournalViewInput) {
  const { t } = useTranslation();
  // The journal line a `walletBalanceChanged` alert pointed at, if any.
  const highlightedEntryId = useHighlightParam();

  // Opt-in: fetched only once the Journal tab is open, and kept alive once
  // visited, so a tab toggle doesn't walk the cursor again.
  const personalFillsBaseKey = activeCharacterId !== null ? `${activeCharacterId}` : null;
  const [visitedFillsKey, setVisitedFillsKey] = useState<string | null>(null);
  if (journalOpen && personalFillsBaseKey !== null && visitedFillsKey !== personalFillsBaseKey) {
    setVisitedFillsKey(personalFillsBaseKey);
  }
  const personalFills = useCorpSnapshot<PersonalFillsSnapshot | null>(
    personalFillsBaseKey !== null && (journalOpen || visitedFillsKey === personalFillsBaseKey)
      ? personalFillsBaseKey
      : null,
    async () => (activeCharacterId === null ? null : loadPersonalFills(activeCharacterId)),
    { name: 'wallet:personal-fills', characterId: activeCharacterId }
  );
  // The Journal's own Character filter reads the same `?char=` pick as the
  // Balance tab; anything beyond the active Character fans the journal out
  // across the picked Characters, and the pick is part of the snapshot's key.
  const journalSelectionKey =
    journalOpen && showingBeyondActive && pickedCharacters.length > 0
      ? pickedCharacters.map((c) => c.characterId).join(',')
      : null;
  const allJournals = useCorpSnapshot<AllJournalsSnapshot | null>(journalSelectionKey, () =>
    loadAllCharactersJournals(pickedCharacters)
  );
  const scopedCharacterIds = useLiveQuery(loadWalletScopedCharacterIds, [], undefined);

  // The fills that name an item or a PLEX line: this Character's, or every loaded Character's.
  const allJournalsData = showingBeyondActive ? allJournals.data : null;
  // Tagged with their Character in the multi view: two journals can carry the same ref id.
  const personalTransactions = useMemo<
    readonly (WalletTransactionCommon & { characterId?: number })[]
  >(
    () =>
      allJournalsData
        ? allJournalsData.loaded.flatMap((c) =>
            c.transactions.map((txn) => ({ ...txn, characterId: c.characterId }))
          )
        : (personalFills.data?.transactions ?? EMPTY_FILLS),
    [allJournalsData, personalFills.data]
  );
  const personalTypeNames =
    (allJournalsData ? allJournalsData.typeNames : personalFills.data?.typeNames) ?? NO_NAMES;
  const itemNamesTruncated = allJournalsData
    ? allJournalsData.loaded.some((c) => c.fillsTruncated)
    : (personalFills.data?.truncated ?? false);
  const journalIsTruncated = allJournalsData
    ? allJournalsData.loaded.some((c) => c.truncated)
    : journalTruncated;
  const keyByCharacter = (allJournalsData?.loaded.length ?? 0) > 1;
  // The stalest of the loaded journals, as the Balance tab does for its balances.
  const allJournalsFetchedAt = useMemo(
    () =>
      allJournalsData && allJournalsData.loaded.length > 0
        ? new Date(Math.min(...allJournalsData.loaded.map((c) => c.fetchedAt.getTime())))
        : null,
    [allJournalsData]
  );
  const personalLinkFor = useMemo(
    () => journalTransactionLinks(personalTransactions),
    [personalTransactions]
  );
  const personalNameFor = useMemo(() => typeNameLookup(personalTypeNames), [personalTypeNames]);
  const characterNameFor = useMemo(() => {
    const names = new Map(allCharacters.map((c) => [c.characterId, c.name]));
    return (id: number) => names.get(id) ?? `#${id}`;
  }, [allCharacters]);
  // Journal lines a pilot linked to a Moon Mining Tax payment get a way back
  // to the tax row they settled. Every character's Assignments, since the
  // journal can show any of them.
  const taxLinks = useLiveQuery(
    async () => linkedRefIds(await db.miningTaxAssignments.toArray()),
    [],
    undefined
  );
  const miningTaxHrefFor = useCallback(
    (entry: WalletJournalEntry) => {
      if (!taxLinks) return undefined;
      if (taxLinks.journal.has(entry.id)) {
        return miningTaxPaymentHref({ kind: 'journal', id: entry.id });
      }
      if (
        entry.context_id_type === 'contract_id' &&
        entry.context_id !== undefined &&
        taxLinks.contract.has(entry.context_id)
      ) {
        return miningTaxPaymentHref({ kind: 'contract', id: entry.context_id });
      }
      return undefined;
    },
    [taxLinks]
  );
  const lossCharacterFor = useCallback(
    (entry: JournalRow) => entry.characterId ?? activeCharacterId ?? undefined,
    [activeCharacterId]
  );
  const buildJournalColumns = useJournalColumnsBuilder();
  const journalColumns = useMemo(
    () =>
      buildJournalColumns(
        personalLinkFor,
        personalNameFor,
        miningTaxHrefFor,
        showingBeyondActive ? characterNameFor : undefined,
        undefined,
        lossCharacterFor
      ),
    [
      buildJournalColumns,
      lossCharacterFor,
      personalLinkFor,
      personalNameFor,
      miningTaxHrefFor,
      showingBeyondActive,
      characterNameFor,
    ]
  );

  // Unsorted: `DataTable`'s own controlled `sort` below is the one place
  // these rows get ordered — sorting here too was a redundant second pass
  // over the same array on every render (issue #413). Export reads the
  // table's sorted rows, so it follows the same order.
  const journal = journalResult?.data ?? EMPTY_JOURNAL;

  // In the URL (`journal.*`, issue #1302).
  const [urlFilter, setJournalFilter, urlRowsFilter] = useUrlFilter<WalletJournalFilter>(
    'personal',
    JOURNAL_FILTER_PARAMS,
    JOURNAL_FIELD_TO_PARAM,
    EMPTY_JOURNAL_FILTER_PARAMS
  );
  // Player is a corp-only filter: a stray `?journal.player=` must not hide personal rows.
  const journalFilter = useMemo(() => ({ ...urlFilter, player: null }), [urlFilter]);
  const journalRowsFilter = useMemo(() => ({ ...urlRowsFilter, player: null }), [urlRowsFilter]);
  // Lines between the pilot's own Characters are netted against every Character
  // with the wallet permission, picked or not: a donation from your own alt is
  // internal even in the one-Character view.
  const journalRows = useMemo<readonly JournalLine[]>(
    () =>
      allJournalsData
        ? allJournalsData.loaded.flatMap((c) =>
            c.journal.map((entry) => ({ ...entry, characterId: c.characterId }))
          )
        : showingBeyondActive || activeCharacterId === null
          ? []
          : journal,
    [allJournalsData, showingBeyondActive, journal, activeCharacterId]
  );
  const trackedIds = useMemo(() => {
    const ids = new Set(scopedCharacterIds ?? []);
    for (const c of allJournalsData?.loaded ?? []) ids.add(c.characterId);
    if (!showingBeyondActive && activeCharacterId !== null && !journalNeedsReauth) {
      ids.add(activeCharacterId);
    }
    return ids;
  }, [
    allJournalsData,
    scopedCharacterIds,
    showingBeyondActive,
    activeCharacterId,
    journalNeedsReauth,
  ]);
  const classifiedJournal = useMemo(
    () => classifyJournal(journalRows, { trackedIds, linkFor: personalLinkFor }),
    [journalRows, trackedIds, personalLinkFor]
  );
  const journalCoverageInfo = useMemo(() => {
    if (allCharacters.length < 2) return undefined;
    return allJournalsData
      ? journalCoverage(pickedCharacters, new Set(allJournalsData.loaded.map((c) => c.characterId)))
      : journalCoverage(
          allCharacters.map((c) => ({ characterId: c.characterId, name: c.name })),
          trackedIds
        );
  }, [allCharacters, allJournalsData, pickedCharacters, trackedIds]);
  const { filteredJournal, breakdownJournal, chartJournal, refTypeOptions } =
    useJournalFilterResult(classifiedJournal, journalRowsFilter);
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  // The title-bar export button and the row menus export the same rows, in
  // the order the table shows them.
  const journalCsvColumns = useMemo(
    () => walletJournalCsvColumns(t, showingBeyondActive ? characterNameFor : undefined),
    [t, showingBeyondActive, characterNameFor]
  );
  const journalExport = useTableExport({
    surface: 'wallet-journal',
    rows: filteredJournal,
    columns: journalCsvColumns,
    truncated: journalIsTruncated,
  });

  const journalFetchedAt = showingBeyondActive
    ? allJournalsFetchedAt
    : (journalResult?.fetchedAt ?? null);
  // An alert's entry id belongs to the active Character; the multi view keys rows per Character.
  const journalHighlightKey =
    keyByCharacter && highlightedEntryId !== null
      ? `${activeCharacterId}:${highlightedEntryId}`
      : highlightedEntryId;
  const journalScopeLabel = !showingBeyondActive
    ? t('character.filter.thisCharacter')
    : pickedCharacters.length === allCharacters.length
      ? t('character.filter.allCharacters')
      : pickedCharacters.length === 1
        ? t('character.scope.one', { name: pickedCharacters[0].name })
        : t('wallet.journalScopeSome', { count: pickedCharacters.length });

  return {
    refresh: () => {
      personalFills.refresh();
      allJournals.refresh();
    },
    loading: personalFills.loading || allJournals.loading,
    panel: {
      journalLength: journal.length,
      allJournalsData,
      allJournalsLoading: allJournals.loading,
      hasJournalSelection: journalSelectionKey !== null,
      onRetryAllJournals: allJournals.refresh,
      journalFetchedAt,
      journalExport,
      journalIsTruncated,
      itemNamesTruncated,
      table: {
        filter: journalFilter,
        onFilterChange: setJournalFilter,
        refTypeOptions,
        filteredJournal,
        breakdownJournal,
        chartJournal,
        journalColumns,
        sort: journalSortProps.sort,
        onSortChange: journalSortProps.onSortChange,
        highlightRowKey: journalHighlightKey,
        keyByCharacter,
      },
      scopeLabel: journalScopeLabel,
      coverage: journalCoverageInfo,
    },
  };
}
