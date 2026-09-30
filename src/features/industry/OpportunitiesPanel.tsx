/**
 * Build Opportunities (issue #642): ranks every manufacturing blueprint the
 * chosen character(s) own by ISK/hour, owned-materials-adjusted, at the
 * default trade hub — the same seeding/sorting/costing layer over
 * `computeBuildPlan`/`buildVsBuy` that Build Plan Compare already prices
 * plans with, just run over every owned blueprint instead of a hand-picked
 * set. Selected rows seed real Build Plans into Compare via `onAddToCompare`.
 *
 * Reuses `CharacterFilterControl` (`ActiveJobsPanel.tsx`'s exact shape) for
 * "this character / all characters / pick some" — this ticket adds no new
 * account-level alt-linking, just this feature's own scoped selector.
 */
import { useEffect, useMemo, useState, type ReactElement } from 'react';
import { useCharacterModifiersByCharacter } from '@/features/character/characterModifiers';
import { useTradeHubStandingsByCharacter } from '@/features/market/useTradeHubStandings';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type BuildPlanRecord } from '@/db';
import {
  Button,
  DataTable,
  EmptyState,
  InfoTooltip,
  IskAmount,
  Modal,
  Panel,
  Spinner,
  StatChip,
  type DataTableColumn,
  Checkbox,
  SegmentedControl,
} from '@/components/ui';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import { useIsDesktop } from '@/lib/useIsDesktop';
import type { CharacterBlueprint } from '@/esi/endpoints';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import type { PiData } from '@/sde/types';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import { useResolvedCharacterFilter } from '@/features/character/characterFilterValue';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import { loadCharacterBlueprints } from './data';
import type { ActivityFacilityDefaults } from './facilityDefaults';
import { formatPercent, numericCell } from './format';
import { MobileOpportunityList } from './MobileOpportunityList';
import { OPPORTUNITIES_DEFAULT_SORT, OPPORTUNITIES_SORT_KEY } from './opportunitiesUrl';
import { ORDER_DEPTH_RANK, ORDER_DEPTH_TONE, unitMargin } from './opportunityMetrics';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { buildOpportunityCandidates, hubForCharacter, type OpportunityRow } from './opportunities';
import { SkillGateMarker } from './SkillGateMarker';
import { useOpportunities } from './useOpportunities';
import { StartPlanButton } from './StartPlanButton';
import { opportunitiesCsvColumns } from './opportunitiesCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { characterFilterParam } from '@/features/character/characterFilterUrlParam';
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { enumParam } from '@/lib/urlState';
import { OwnedBlueprintsPanel } from './OwnedBlueprintsPanel';

interface OpportunitiesPanelProps {
  catalog: BlueprintCatalog;
  pi: PiData | null;
  facilityDefaults: ActivityFacilityDefaults;
  activeCharacterId: number;
  ownedStockSnapshot: OwnedStockSnapshot;
  /**
   * ME to quote an unowned sub-build at — `buildPlanPricingInputs.ts`'s
   * `assumedMe`, the one pricing input this panel reads (#2055).
   * `Industry.tsx` doesn't mount this panel until `pricingInputs.hydrated`,
   * so this is always the pilot's own setting, never the default (#2054).
   */
  assumedMe: number;
  onAddToCompare: (rows: readonly OpportunityRow[]) => void;
  /** Resolves true once it has opened the new plan (see `StartPlanButton`). */
  onStartPlan: (entry: BlueprintCatalogEntry) => Promise<boolean>;
  /**
   * The oldest blueprint fetch behind these rows, or null — reported up
   * rather than drawn here, so the route can show it beside the page title
   * (`PageHeader.meta`) instead of crowding this panel's header.
   */
  onDataAgeChange?: (date: Date | null) => void;
}

/** `'current'`, not the synced default: this panel has always opened on the active pilot. */
const CHARACTER_FILTER = characterFilterParam('current');

/**
 * The columns' sort keys, at module scope: the columns themselves close over
 * selection state and `onStartPlan` (which the parent rebuilds every
 * render), but `DataTable` keys its sort memo on the active `sortValue`, so
 * keeping these stable is what stops a re-render from re-sorting every row.
 */
const SORT_VALUE = {
  product: (row: OpportunityRow) => row.candidate.catalogEntry.productName,
  // -1 means BPO/unlimited runs — sorts as the largest, not the smallest.
  // `MAX_SAFE_INTEGER` rather than `Infinity`: two BPO rows would compare
  // `Infinity - Infinity`, which is `NaN`.
  blueprint: (row: OpportunityRow) =>
    row.candidate.blueprint.runs === -1 ? Number.MAX_SAFE_INTEGER : row.candidate.blueprint.runs,
  unitMargin: (row: OpportunityRow) => unitMargin(row) ?? undefined,
  margin: (row: OpportunityRow) => row.result.marginPct ?? undefined,
  duration: (row: OpportunityRow) => row.result.seconds,
  iskPerHour: (row: OpportunityRow) => row.result.iskPerHour ?? undefined,
  orderDepth: (row: OpportunityRow) => ORDER_DEPTH_RANK[row.orderDepth],
};
const OPPORTUNITIES_CHARACTERS_KEY = 'opps.chars';
/**
 * Ranked (the default) or "All owned" (issue #2335): the same owned
 * blueprints and Character filter, either priced and ranked or listed whole.
 */
const VIEW_PARAM = enumParam(['ranked', 'owned'] as const, 'ranked');

/** Module-level so the table's windowing sees one stable function. */
const opportunityRowKey = (row: OpportunityRow) => row.candidate.id;

export function OpportunitiesPanel({
  catalog,
  pi,
  facilityDefaults,
  activeCharacterId,
  ownedStockSnapshot,
  assumedMe,
  onAddToCompare,
  onStartPlan,
  onDataAgeChange,
}: OpportunitiesPanelProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');
  const isDesktop = useIsDesktop();

  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const characterCandidates = useMemo(
    () => (allCharacters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [allCharacters]
  );
  const characterNames = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );

  const [view, setView] = useUrlParam('opps.view', VIEW_PARAM);
  const [characterFilter, setCharacterFilter] = useUrlParam(
    OPPORTUNITIES_CHARACTERS_KEY,
    CHARACTER_FILTER
  );
  // `useResolvedCharacterFilter`, not the raw `resolveCharacterFilter`: this
  // panel's resolved filter feeds `characterIds` and through it the
  // blueprint-loading effect's dep array below, and the raw function
  // allocates a fresh `Set` per call for `'current'` — routing that
  // unmemoized identity into an effect dep array is exactly what caused an
  // infinite render loop here before (issue #675, React error #185).
  const resolvedCharacterIds = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const nextCharacterIds =
    resolvedCharacterIds === 'all'
      ? characterCandidates.map((c) => c.characterId)
      : [...resolvedCharacterIds];
  // Stabilizes the array's *identity* across renders where its *values*
  // haven't changed — memoizing on the ids themselves (via a joined string,
  // a plain primitive) rather than on `characterCandidates`'s own identity,
  // which still allocates a fresh array whenever `allCharacters`'s
  // `useLiveQuery` result changes, even to an equal roster. The
  // blueprint-loading effect below keys off this array by reference, so a
  // churning identity re-fires it every such commit — the "one redundant
  // load... when useLiveQuery swaps its default [] for the real roster" the
  // render-loop-settling test above already flags as bounded but
  // unaddressed; this closes it so the effect only ever re-fires when the
  // actual selected characters change.
  const characterIdsKey = nextCharacterIds.join(',');
  const characterIds = useMemo(
    () => (characterIdsKey === '' ? [] : characterIdsKey.split(',').map(Number)),
    [characterIdsKey]
  );

  // One state object rather than two separate `useState` calls: every branch
  // below is then exactly one `setState` call, matching this codebase's
  // `react-hooks/set-state-in-effect` rule.
  const [blueprintsState, setBlueprintsState] = useState<{
    ownedByCharacter: Map<number, CharacterBlueprint[]>;
    loading: boolean;
    /** Oldest fetch across every fetched Character — reported up through `onDataAgeChange`. */
    oldestFetchedAt: Date | null;
  }>({ ownedByCharacter: new Map(), loading: true, oldestFetchedAt: null });

  useEffect(() => {
    if (characterIds.length === 0) {
      // A plain reset, not a derived sync worth restructuring around: no
      // Character is selected, so there is nothing to fetch and the panel's
      // empty state should say so immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBlueprintsState({ ownedByCharacter: new Map(), loading: false, oldestFetchedAt: null });
      return;
    }
    let cancelled = false;
    setBlueprintsState((prev) => ({ ...prev, loading: true }));
    void Promise.all(characterIds.map((id) => loadCharacterBlueprints(id))).then((results) => {
      if (cancelled) return;
      const map = new Map<number, CharacterBlueprint[]>();
      let oldestFetchedAt: Date | null = null;
      results.forEach((result, index) => {
        map.set(characterIds[index]!, result.cached?.data ?? []);
        const fetchedAt = result.cached?.fetchedAt;
        if (fetchedAt && (!oldestFetchedAt || fetchedAt < oldestFetchedAt))
          oldestFetchedAt = fetchedAt;
      });
      setBlueprintsState({ ownedByCharacter: map, loading: false, oldestFetchedAt });
    });
    return () => {
      cancelled = true;
    };
  }, [characterIds]);
  const { ownedByCharacter, loading: blueprintsLoading, oldestFetchedAt } = blueprintsState;
  const oldestFetchedMs = oldestFetchedAt?.getTime() ?? null;
  useEffect(() => {
    onDataAgeChange?.(oldestFetchedMs === null ? null : new Date(oldestFetchedMs));
  }, [oldestFetchedMs, onDataAgeChange]);
  useEffect(() => () => onDataAgeChange?.(null), [onDataAgeChange]);

  const candidates = useMemo(
    () => buildOpportunityCandidates(ownedByCharacter, characterNames, catalog),
    [ownedByCharacter, characterNames, catalog]
  );

  // Every candidate's own Build Plan, for `hubForCharacter` below (issue
  // #2055): the same Trade Hub a fresh plan for that Character would default
  // to (`mostRecentlyUpdatedPlan`'s rule), not a hard-coded default.
  const plansQuery = useLiveQuery(
    () => db.buildPlans.where('characterId').anyOf(characterIds).toArray(),
    [characterIds],
    []
  );
  const plansByCharacter = useMemo(() => {
    const map = new Map<number, BuildPlanRecord[]>();
    for (const plan of plansQuery ?? []) {
      const list = map.get(plan.characterId);
      if (list) list.push(plan);
      else map.set(plan.characterId, [plan]);
    }
    return map;
  }, [plansQuery]);
  const resolveHubForCharacter = useMemo(
    () => (characterId: number) => hubForCharacter(characterId, plansByCharacter),
    [plansByCharacter]
  );

  // Each owning Character's own standings/skills (issue #2055), not just the
  // active Character's — a candidate seeded by an alt prices at that alt's
  // real broker fee, not the pilot currently viewing the panel.
  const modifiersByCharacter = useCharacterModifiersByCharacter(characterIds, {
    skipQueueWithoutScope: true,
    levels: 'effective',
  });
  const standingsByCharacter = useTradeHubStandingsByCharacter(characterIds);

  const { rows, loading, progress, manualRefreshOnly, needsRefresh, refresh } = useOpportunities({
    candidates,
    catalog,
    pi,
    hubForCharacter: resolveHubForCharacter,
    facilityDefaults,
    modifiersByCharacter,
    standingsByCharacter,
    ownedStockSnapshot,
    ownedByCharacter,
    assumedMe,
  });

  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectedRows = rows.filter((row) => selectedIds.has(row.candidate.id));

  // Account-wide, not this panel's own `characterFilter` (issue #1231): a
  // gate must stay true regardless of which character the filter happens to
  // be scoped to, the same precedent `MarketWideOpportunitiesPanel` sets.
  const skillGateCharacterIds = useMemo(
    () => characterCandidates.map((c) => c.characterId),
    [characterCandidates]
  );
  const accountSkills = useAccountSkillLevels(skillGateCharacterIds);
  const skillGateByProductTypeID = useMemo(() => {
    const verdicts = new Map<number, SkillGateVerdict>();
    for (const row of rows) {
      const productTypeID = row.candidate.catalogEntry.productTypeID;
      if (productTypeID === null || verdicts.has(productTypeID)) continue;
      verdicts.set(
        productTypeID,
        evaluateSkillGate(row.candidate.catalogEntry.blueprint.skills, accountSkills)
      );
    }
    return verdicts;
  }, [rows, accountSkills]);

  // Mounting `PriceHistoryPanel` is what fetches the item's market history
  // (`loadPriceHistory`) — kept out of the row tree entirely until a pilot
  // asks for one, so rendering the ranked list never issues a market-history
  // request and opening exactly one row issues exactly one.
  const [historyItem, setHistoryItem] = useState<{
    typeId: number;
    itemName: string;
    regionId: number;
  } | null>(null);

  const showCharacterFilter = characterCandidates.length > 1;
  const showCharacterColumn = new Set(rows.map((r) => r.candidate.characterId)).size > 1;

  const csvColumns = useMemo(() => opportunitiesCsvColumns(t), [t]);
  const opportunitiesExport = useTableExport({
    surface: 'industry-opportunities',
    rows,
    columns: csvColumns,
  });

  const columns: DataTableColumn<OpportunityRow>[] = [
    {
      // Desktop-only column now (`isDesktop` gates this whole `DataTable`
      // below — see the render branch): the `cardCorner`/enlarged-target
      // fix this column carried for the stacked layout moved to
      // `MobileOpportunityList`'s own corner-pinned checkbox once the phone
      // list stopped going through `DataTable` at all.
      id: 'select',
      header: '',
      className: 'w-8',
      render: (row) => (
        <Checkbox
          checked={selectedIds.has(row.candidate.id)}
          onChange={() => toggleSelected(row.candidate.id)}
          aria-label={t('industry.opportunitiesSelectFor', {
            name: row.candidate.catalogEntry.productName,
          })}
        />
      ),
    },
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: SORT_VALUE.product,
      render: (row) => {
        const productTypeID = row.candidate.catalogEntry.productTypeID;
        const verdict = productTypeID !== null ? skillGateByProductTypeID.get(productTypeID) : null;
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            {productTypeID !== null ? (
              <MarketItemLink typeId={productTypeID}>
                {row.candidate.catalogEntry.productName}
              </MarketItemLink>
            ) : (
              row.candidate.catalogEntry.productName
            )}
            {verdict?.gated && (
              <SkillGateMarker
                verdict={verdict}
                nameForSkill={(typeID) => nameForType(catalog, typeID)}
                nameForCharacter={(id) => characterNames.get(id) ?? unknown}
              />
            )}
            {showCharacterColumn && (
              <span className="text-[0.6875rem] text-text-dim">{row.candidate.characterName}</span>
            )}
          </span>
        );
      },
    },
    {
      id: 'blueprint',
      header: t('industry.opportunitiesBlueprint'),
      sortValue: SORT_VALUE.blueprint,
      render: (row) => {
        const original = row.candidate.blueprint.runs === -1;
        return (
          <StatChip
            label={original ? t('industry.bpo') : t('industry.bpc')}
            value={
              original ? t('industry.opportunitiesUnlimitedRuns') : row.candidate.blueprint.runs
            }
            tone={original ? 'accent' : 'default'}
          />
        );
      },
    },
    {
      id: 'unitMargin',
      header: t('industry.opportunitiesUnitMargin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.unitMargin,
      cellClassName: (row) => {
        const margin = unitMargin(row);
        return margin !== null ? iskToneClass(margin) : undefined;
      },
      render: (row) =>
        numericCell(
          unitMargin(row),
          // Tap: the figure is inert — the row's own controls are buttons of their own.
          (v) => <IskAmount value={v} revealOn="tap" decimals={0} />,
          unknown
        ),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.margin,
      render: (row) => numericCell(row.result.marginPct, formatPercent, unknown),
    },
    {
      id: 'duration',
      header: t('industry.time'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.duration,
      render: (row) => formatDuration(row.result.seconds),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerHour,
      cellClassName: (row) =>
        row.result.iskPerHour !== null ? iskToneClass(row.result.iskPerHour) : undefined,
      render: (row) =>
        numericCell(
          row.result.iskPerHour,
          // Tap: the figure is inert — the row's own controls are buttons of their own.
          (v) => <IskAmount value={v} revealOn="tap" decimals={0} />,
          unknown
        ),
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      sortValue: SORT_VALUE.orderDepth,
      render: (row) => (
        <span className="flex items-center gap-1">
          <StatChip
            label={t('industry.opportunitiesOrderDepthLabel')}
            value={t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
            tone={ORDER_DEPTH_TONE[row.orderDepth]}
          />
          {row.result.profit !== null && row.result.profit < 0 && (
            <InfoTooltip
              label={t('industry.opportunitiesLossBreakdownFor', {
                name: row.candidate.catalogEntry.productName,
              })}
              content={t('industry.opportunitiesLossBreakdown', {
                cost: formatIsk(row.result.totalCost),
                revenue: row.result.revenue !== null ? formatIsk(row.result.revenue) : unknown,
              })}
            />
          )}
        </span>
      ),
    },
    {
      // Same pattern `MarketWideOpportunitiesPanel` sets (issue #1781): a
      // direct per-row action rather than routing every plan through the
      // Compare button, which needs 2+ selected rows to do anything.
      id: 'action',
      header: '',
      render: (row) => <StartPlanButton onStart={() => onStartPlan(row.candidate.catalogEntry)} />,
    },
  ];
  // A row whose product type is unknown has no item to open a menu for, so it
  // renders bare (the price-history button is withheld for the same reason).
  const rowContextMenu = (row: OpportunityRow, tr: ReactElement): ReactElement => {
    const { productTypeID, productName, blueprintTypeID } = row.candidate.catalogEntry;
    if (productTypeID === null) return tr;
    return (
      <ItemContextMenu
        typeId={productTypeID}
        itemName={productName}
        blueprintTypeID={blueprintTypeID}
      >
        {tr}
      </ItemContextMenu>
    );
  };
  const sortProps = useUrlSort(
    OPPORTUNITIES_SORT_KEY,
    OPPORTUNITIES_DEFAULT_SORT,
    columns.map((column) => column.id)
  );

  const meta = (
    <span className="flex flex-wrap items-center gap-2">
      <SegmentedControl
        label={t('industry.opportunitiesView')}
        size="sm"
        value={view}
        onChange={setView}
        options={[
          { value: 'ranked', label: t('industry.opportunitiesViewRanked') },
          { value: 'owned', label: t('industry.opportunitiesViewOwned') },
        ]}
      />
      {showCharacterFilter && (
        <CharacterFilterControl
          activeCharacterId={activeCharacterId}
          value={characterFilter}
          onChange={setCharacterFilter}
        />
      )}
    </span>
  );

  const showProgress = loading && progress.total > 0;
  const pricingActions = (
    <>
      {showProgress && (
        <span className="text-xs text-text-dim tabular-nums">
          {t('industry.opportunitiesProgress', { done: progress.done, total: progress.total })}
        </span>
      )}
      {manualRefreshOnly && (
        <Button size="sm" onClick={refresh} disabled={loading}>
          {t('industry.opportunitiesRefresh')}
        </Button>
      )}
    </>
  );

  if (view === 'owned') {
    return (
      <OwnedBlueprintsPanel
        catalog={catalog}
        activeCharacterId={activeCharacterId}
        ownedByCharacter={ownedByCharacter}
        characterNames={characterNames}
        rankedRows={rows}
        ownedStockSnapshot={ownedStockSnapshot}
        loading={blueprintsLoading}
        meta={meta}
        pricingActions={pricingActions}
        onStartPlan={onStartPlan}
      />
    );
  }

  return (
    <Panel
      title={t('industry.opportunitiesTitle')}
      meta={meta}
      actions={
        <span className="flex items-center gap-2">
          {pricingActions}
          {selectedRows.length > 1 && (
            <Button size="sm" variant="primary" onClick={() => onAddToCompare(selectedRows)}>
              {t('industry.opportunitiesAddToCompare', { count: selectedRows.length })}
            </Button>
          )}
          {rows.length > 0 && (
            <TableActionsMenu
              name={t('industry.opportunitiesTitle')}
              tableExport={opportunitiesExport}
            />
          )}
        </span>
      }
    >
      {blueprintsLoading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('common.loading')} />
        </div>
      ) : candidates.length === 0 ? (
        <EmptyState
          title={t('industry.opportunitiesEmptyTitle')}
          hint={t('industry.opportunitiesEmptyHint')}
          className="py-8"
        />
      ) : needsRefresh ? (
        <EmptyState
          title={t('industry.opportunitiesNeedsRefreshTitle')}
          hint={t('industry.opportunitiesNeedsRefreshHint')}
          className="py-8"
        />
      ) : isDesktop ? (
        <div className="overflow-x-auto">
          <DataTable
            {...opportunitiesExport.tableProps}
            columns={columns}
            rows={rows}
            rowKey={opportunityRowKey}
            virtualize="auto"
            label={t('industry.opportunitiesTitle')}
            rowContextMenu={rowContextMenu}
            rowMoreActions
            {...sortProps}
          />
        </div>
      ) : (
        <MobileOpportunityList
          rows={rows}
          showCharacterColumn={showCharacterColumn}
          selectedIds={selectedIds}
          onToggleSelected={toggleSelected}
          onStartPlan={onStartPlan}
          onViewHistory={(typeId, itemName, regionId) =>
            setHistoryItem({ typeId, itemName, regionId })
          }
          skillGateFor={(productTypeID) => skillGateByProductTypeID.get(productTypeID)}
          nameForSkill={(typeID) => nameForType(catalog, typeID)}
          nameForCharacter={(id) => characterNames.get(id) ?? unknown}
        />
      )}
      {historyItem && (
        <Modal
          open
          onClose={() => setHistoryItem(null)}
          title={t('industry.opportunitiesPriceHistoryTitle', { name: historyItem.itemName })}
          placement="wide"
        >
          <PriceHistoryPanel
            regionId={historyItem.regionId}
            typeId={historyItem.typeId}
            itemName={historyItem.itemName}
          />
        </Modal>
      )}
    </Panel>
  );
}
