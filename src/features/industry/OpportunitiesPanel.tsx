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
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  Button,
  DataAgeBadge,
  DataTable,
  EmptyState,
  IconButton,
  InfoTooltip,
  Modal,
  Panel,
  Spinner,
  StatChip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { formatDuration } from '@/lib/duration';
import { formatIsk } from '@/lib/isk';
import { iskToneClass } from '@/features/character/format';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { SkillLevels } from '@/engine/industry/types';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { PiData } from '@/sde/types';
import { DEFAULT_TRADE_HUB } from '@/market/hubs';
import { PriceHistoryPanel } from '@/features/market/PriceHistoryPanel';
import { CharacterFilterControl } from '@/features/character/CharacterFilterControl';
import {
  useResolvedCharacterFilter,
  type CharacterFilterValue,
} from '@/features/character/characterFilterValue';
import type { BlueprintCatalog } from './blueprintCatalog';
import { loadCharacterBlueprints } from './data';
import type { FacilityDefaults } from './facilityDefaults';
import { formatPercent } from './format';
import type { OwnedStockSnapshot } from './ownedStockDetection';
import { buildOpportunityCandidates, type OpportunityRow } from './opportunities';
import { useOpportunities } from './useOpportunities';
import { useAssumedMe } from './assumedMe';

interface OpportunitiesPanelProps {
  catalog: BlueprintCatalog;
  pi: PiData | null;
  skills: SkillLevels;
  facilityDefaults: FacilityDefaults;
  activeCharacterId: number;
  ownedStockSnapshot: OwnedStockSnapshot;
  onAddToCompare: (rows: readonly OpportunityRow[]) => void;
}

const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

function unitCount(row: OpportunityRow): number {
  const quantity = row.candidate.catalogEntry.blueprint.products[0]?.quantity ?? 1;
  return quantity * row.candidate.blueprint.runs;
}

function unitMargin(row: OpportunityRow): number | null {
  if (row.result.profit === null) return null;
  const units = unitCount(row);
  return units > 0 ? row.result.profit / units : null;
}

function numericCell(value: number | null, format: (v: number) => string, unknown: string): string {
  return value === null ? unknown : format(value);
}

export function OpportunitiesPanel({
  catalog,
  pi,
  skills,
  facilityDefaults,
  activeCharacterId,
  ownedStockSnapshot,
  onAddToCompare,
}: OpportunitiesPanelProps) {
  const { t } = useTranslation();
  const unknown = t('common.unknown');

  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const characterCandidates = useMemo(
    () => (allCharacters ?? []).map((c) => ({ characterId: c.characterId, characterName: c.name })),
    [allCharacters]
  );
  const characterNames = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );

  const [characterFilter, setCharacterFilter] = useState<CharacterFilterValue>('current');
  // `useResolvedCharacterFilter`, not the raw `resolveCharacterFilter`: this
  // panel's resolved filter feeds `characterIds` and through it the
  // blueprint-loading effect's dep array below, and the raw function
  // allocates a fresh `Set` per call for `'current'` — routing that
  // unmemoized identity into an effect dep array is exactly what caused an
  // infinite render loop here before (issue #675, React error #185).
  const resolvedCharacterIds = useResolvedCharacterFilter(characterFilter, activeCharacterId);
  const characterIds = useMemo(
    () =>
      resolvedCharacterIds === 'all'
        ? characterCandidates.map((c) => c.characterId)
        : [...resolvedCharacterIds],
    [resolvedCharacterIds, characterCandidates]
  );

  // One state object rather than two separate `useState` calls: every branch
  // below is then exactly one `setState` call, matching this codebase's
  // `react-hooks/set-state-in-effect` rule.
  const [blueprintsState, setBlueprintsState] = useState<{
    ownedByCharacter: Map<number, CharacterBlueprint[]>;
    loading: boolean;
    /** Oldest fetch across every fetched Character — the panel's `DataAgeBadge` reads this. */
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

  const candidates = useMemo(
    () => buildOpportunityCandidates(ownedByCharacter, characterNames, catalog),
    [ownedByCharacter, characterNames, catalog]
  );

  // Same setting BuildPlanDetail.tsx uses for an owned-blueprint's unowned
  // sub-builds — a priced sub-build quotes at the pilot's own assumption,
  // not a hard 0, the same way a hand-ticked one would.
  const assumedMe = useAssumedMe((state) => state.value);
  const hydrateAssumedMe = useAssumedMe((state) => state.hydrate);
  useEffect(() => {
    void hydrateAssumedMe();
  }, [hydrateAssumedMe]);

  const { rows, loading, progress, manualRefreshOnly, refresh } = useOpportunities({
    candidates,
    catalog,
    pi,
    hub: DEFAULT_TRADE_HUB,
    facilityDefaults,
    skills,
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

  // Mounting `PriceHistoryPanel` is what fetches the item's market history
  // (`loadPriceHistory`) — kept out of the row tree entirely until a pilot
  // asks for one, so rendering the ranked list never issues a market-history
  // request and opening exactly one row issues exactly one.
  const [historyItem, setHistoryItem] = useState<{ typeId: number; itemName: string } | null>(null);

  const showCharacterFilter = characterCandidates.length > 1;
  const showCharacterColumn = new Set(rows.map((r) => r.candidate.characterId)).size > 1;

  const columns: DataTableColumn<OpportunityRow>[] = [
    {
      id: 'select',
      header: '',
      className: 'w-8',
      render: (row) => {
        // Build Plan Compare only ever shows the active Character's own
        // plans (`Industry.tsx`'s `plans` query is scoped that way) — a
        // seeded plan for another Character would silently never appear
        // there, so seeding is limited to rows the active Character owns.
        const seedable = row.candidate.characterId === activeCharacterId;
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(row.candidate.id)}
            onChange={() => toggleSelected(row.candidate.id)}
            disabled={!seedable}
            title={seedable ? undefined : t('industry.opportunitiesCompareActiveCharacterOnly')}
            aria-label={t('industry.opportunitiesSelectFor', {
              name: row.candidate.catalogEntry.productName,
            })}
            className="size-4 shrink-0 cursor-pointer accent-accent disabled:cursor-not-allowed disabled:opacity-40"
          />
        );
      },
    },
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: (row) => row.candidate.catalogEntry.productName,
      render: (row) => {
        const productTypeID = row.candidate.catalogEntry.productTypeID;
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            {row.candidate.catalogEntry.productName}
            {showCharacterColumn && (
              <span className="text-[0.6875rem] text-text-dim">{row.candidate.characterName}</span>
            )}
            {productTypeID !== null && (
              <IconButton
                size="sm"
                icon={<Icon.Market />}
                label={t('industry.opportunitiesViewHistory', {
                  name: row.candidate.catalogEntry.productName,
                })}
                onClick={() =>
                  setHistoryItem({
                    typeId: productTypeID,
                    itemName: row.candidate.catalogEntry.productName,
                  })
                }
              />
            )}
          </span>
        );
      },
    },
    {
      id: 'blueprint',
      header: t('industry.opportunitiesBlueprint'),
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
      sortValue: (row) => unitMargin(row) ?? undefined,
      cellClassName: (row) => {
        const margin = unitMargin(row);
        return margin !== null ? iskToneClass(margin) : undefined;
      },
      render: (row) => numericCell(unitMargin(row), (v) => formatIsk(v), unknown),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result.marginPct ?? undefined,
      render: (row) => numericCell(row.result.marginPct, formatPercent, unknown),
    },
    {
      id: 'duration',
      header: t('industry.time'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result.seconds,
      render: (row) => formatDuration(row.result.seconds),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result.iskPerHour ?? undefined,
      cellClassName: (row) =>
        row.result.iskPerHour !== null ? iskToneClass(row.result.iskPerHour) : undefined,
      render: (row) => numericCell(row.result.iskPerHour, (v) => formatIsk(v), unknown),
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
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
  ];

  const meta = (
    <span className="flex flex-wrap items-center gap-2">
      {showCharacterFilter && (
        <CharacterFilterControl
          characters={characterCandidates}
          activeCharacterId={activeCharacterId}
          value={characterFilter}
          onChange={setCharacterFilter}
        />
      )}
      {oldestFetchedAt && <DataAgeBadge date={oldestFetchedAt} />}
    </span>
  );

  const showProgress = loading && progress.total > 0;

  return (
    <Panel
      title={t('industry.opportunitiesTitle')}
      meta={meta}
      actions={
        <span className="flex items-center gap-2">
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
          {selectedRows.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => onAddToCompare(selectedRows)}>
              {t('industry.opportunitiesAddToCompare', { count: selectedRows.length })}
            </Button>
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
      ) : (
        <div className="overflow-x-auto">
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(row) => row.candidate.id}
            label={t('industry.opportunitiesTitle')}
            defaultSort={{ columnId: 'iskPerHour', direction: 'desc' }}
          />
        </div>
      )}
      {historyItem && (
        <Modal
          open
          onClose={() => setHistoryItem(null)}
          title={t('industry.opportunitiesPriceHistoryTitle', { name: historyItem.itemName })}
          placement="wide"
        >
          <PriceHistoryPanel
            regionId={DEFAULT_TRADE_HUB.regionId}
            typeId={historyItem.typeId}
            itemName={historyItem.itemName}
          />
        </Modal>
      )}
    </Panel>
  );
}
