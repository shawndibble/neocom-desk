import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import type { JournalRow } from '@/engine/journalNetting';
import { NO_NAMES } from '@/lib/emptyCollections';
import { useHighlightParam } from '@/lib/useHighlightParam';
import { useUrlFilter, useUrlSort } from '@/lib/useUrlState';
import { useTableExport } from '@/components/ui/useTableExport';
import { useCorpSnapshot } from '@/features/corp/useCorpSnapshot';
import { miningTaxEntryHref } from '@/features/miningTax/paymentDeepLink';
import { loadLinkedDays } from '@/features/miningTax/paymentLinkStore';
import { walletJournalCsvColumns } from '@/features/character/walletJournalCsv';
import { classifyJournal, journalCoverage, type JournalLine } from '@/engine/journalNetting';
import {
  loadAllCharactersJournals,
  loadWalletScopedCharacterIds,
  type AllJournalsSnapshot,
} from '@/features/character/walletJournalAll';
import type { MiningTaxEntryLink } from '@/features/character/JournalDescriptionCell';
import { usePartyNames } from '@/features/character/usePartyNames';
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
  journalOpen: boolean;
  activeCharacterId: number | null;
  showingBeyondActive: boolean;
  pickedCharacters: NetWorthCharacter[];
  allCharacters: readonly NetWorthCharacter[];
  journalResult: CachedResult<WalletJournalEntry[]> | null;
  journalNeedsReauth: boolean;
  journalTruncated: boolean;
}

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
  const highlightedEntryId = useHighlightParam();

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
  const journalSelectionKey =
    journalOpen && showingBeyondActive && pickedCharacters.length > 0
      ? pickedCharacters.map((c) => c.characterId).join(',')
      : null;
  const allJournals = useCorpSnapshot<AllJournalsSnapshot | null>(journalSelectionKey, () =>
    loadAllCharactersJournals(pickedCharacters)
  );
  const scopedCharacterIds = useLiveQuery(loadWalletScopedCharacterIds, [], undefined);

  const allJournalsData = showingBeyondActive ? allJournals.data : null;
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
  const taxLinks = useLiveQuery(() => loadLinkedDays(), [], undefined);
  const miningTaxEntriesFor = useCallback(
    (entry: WalletJournalEntry): MiningTaxEntryLink[] | undefined => {
      if (!taxLinks) return undefined;
      const paid =
        taxLinks.get(`journal:${entry.id}`) ??
        (entry.context_id_type === 'contract_id' && entry.context_id !== undefined
          ? taxLinks.get(`contract:${entry.context_id}`)
          : undefined);
      return paid?.map((d) => ({
        href: miningTaxEntryHref(d.id),
        date: d.date,
        taxOwed: d.taxOwed,
      }));
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
        miningTaxEntriesFor,
        showingBeyondActive ? characterNameFor : undefined,
        undefined,
        lossCharacterFor
      ),
    [
      buildJournalColumns,
      lossCharacterFor,
      personalLinkFor,
      personalNameFor,
      miningTaxEntriesFor,
      showingBeyondActive,
      characterNameFor,
    ]
  );

  const journal = journalResult?.data ?? EMPTY_JOURNAL;

  const [urlFilter, setJournalFilter, urlRowsFilter] = useUrlFilter<WalletJournalFilter>(
    'personal',
    JOURNAL_FILTER_PARAMS,
    JOURNAL_FIELD_TO_PARAM,
    EMPTY_JOURNAL_FILTER_PARAMS
  );
  const journalFilter = useMemo(() => ({ ...urlFilter, player: null }), [urlFilter]);
  const journalRowsFilter = useMemo(() => ({ ...urlRowsFilter, player: null }), [urlRowsFilter]);
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
    () =>
      classifyJournal(journalRows, {
        trackedIds,
        linkFor: personalLinkFor,
        defaultCharacterId: activeCharacterId ?? undefined,
      }),
    [journalRows, trackedIds, personalLinkFor, activeCharacterId]
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
  const { filteredJournal, breakdownJournal, partyBreakdownJournal, chartJournal, refTypeOptions } =
    useJournalFilterResult(classifiedJournal, journalRowsFilter);
  const partyIds = useMemo(
    () => [
      ...new Set(
        classifiedJournal.flatMap((row) => (row.partyId === undefined ? [] : [row.partyId]))
      ),
    ],
    [classifiedJournal]
  );
  const partyNames = usePartyNames(partyIds);
  const partyNameFor = useCallback((id: number) => partyNames.get(id) ?? `#${id}`, [partyNames]);
  const partyOptions = useMemo(
    () =>
      partyIds
        .map((id) => ({ id: String(id), name: partyNameFor(id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [partyIds, partyNameFor]
  );
  const partyView = useMemo(
    () => ({ options: partyOptions, nameFor: partyNameFor, journal: partyBreakdownJournal }),
    [partyOptions, partyNameFor, partyBreakdownJournal]
  );
  const journalSortProps = useUrlSort('journal.sort', JOURNAL_SORT, JOURNAL_SORT_COLUMN_IDS);

  const journalCsvColumns = useMemo(
    () =>
      walletJournalCsvColumns(t, {
        characterName: showingBeyondActive ? characterNameFor : undefined,
        fills: { linkFor: personalLinkFor, nameFor: personalNameFor },
      }),
    [t, showingBeyondActive, characterNameFor, personalLinkFor, personalNameFor]
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
        partyView,
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
