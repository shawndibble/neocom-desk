/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Scan".
 */
import { useMemo, type ReactElement } from 'react';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  InfoTooltip,
  IskAmount,
  Panel,
  Spinner,
  StatChip,
  type DataTableColumn,
  type StatChipTone,
} from '@/components/ui';
import { db } from '@/db';
import { iskToneClass } from '@/features/character/format';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import { BLUEPRINT_SOURCE_RANK } from '@/engine/industry/blueprintObtainability';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { MarketWideTreeMap } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { useTradeHubStandings, tradeHubStanding } from '@/features/market/useTradeHubStandings';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { SkillGateMarker } from './SkillGateMarker';
import { ORDER_DEPTH_RANK } from './opportunityMetrics';
import { useUrlParam, useUrlSort } from '@/lib/useUrlState';
import { boolParam } from '@/lib/urlState';

const ORDER_DEPTH_TONE: Record<OrderDepthLevel, StatChipTone> = {
  deep: 'success',
  moderate: 'default',
  thin: 'warning',
  unknown: 'default',
};

interface MarketWideOpportunitiesPanelProps {
  hub: TradeHub;
  trees: MarketWideTreeMap | null;
  catalog: BlueprintCatalog | null;
  modifiers: CharacterModifiers;
  /** For the standing toward `hub`'s NPC owner (issue #1238). Null while no character is active. */
  activeCharacterId: number | null;
  onStartPlan: (entry: BlueprintCatalogEntry) => void;
}

const HIDE_SKILL_GATED = boolParam();

/**
 * The columns' sort keys, at module scope: the columns themselves close over
 * render-time state (and `onStartPlan`, which the parent rebuilds every
 * render), but `DataTable` keys its sort memo on the active `sortValue`, so
 * keeping these stable is what stops a re-render from re-sorting every row.
 */
const SORT_VALUE = {
  product: (row: MarketWideResultRow) => row.productName,
  blueprintSource: (row: MarketWideResultRow) => BLUEPRINT_SOURCE_RANK[row.blueprintSource],
  iskPerHour: (row: MarketWideResultRow) => row.iskPerHour ?? undefined,
  buildCost: (row: MarketWideResultRow) => row.buildCost,
  orderDepth: (row: MarketWideResultRow) => ORDER_DEPTH_RANK[row.orderDepth],
};
const MARKET_WIDE_DEFAULT_SORT = { columnId: 'iskPerHour', direction: 'desc' } as const;

export function MarketWideOpportunitiesPanel({
  hub,
  trees,
  catalog,
  modifiers,
  activeCharacterId,
  onStartPlan,
}: MarketWideOpportunitiesPanelProps) {
  const { t } = useTranslation();
  const tradeHubStandings = useTradeHubStandings(activeCharacterId);
  const standing = tradeHubStanding(tradeHubStandings, hub.id);

  // Account-wide, not active-character: every character on the account, same
  // precedent `OpportunitiesPanel`'s own multi-character fan-out sets. The
  // scan reads the same set for whose blueprints, contracts and LP count.
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const characterNames = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );
  const characterIds = useMemo(() => [...characterNames.keys()], [characterNames]);
  const { rows, loading, hasRun, unavailableSources, run } = useMarketWideOpportunities({
    hub,
    trees,
    catalog,
    modifiers,
    standing,
    characterIds,
  });
  const accountSkills = useAccountSkillLevels(characterIds);

  const skillGateByProductTypeID = useMemo(() => {
    const verdicts = new Map<number, SkillGateVerdict>();
    if (!catalog) return verdicts;
    for (const row of rows) {
      const requirements =
        catalog.byBlueprintTypeID.get(row.blueprintTypeID)?.blueprint.skills ?? [];
      verdicts.set(row.productTypeID, evaluateSkillGate(requirements, accountSkills));
    }
    return verdicts;
  }, [rows, catalog, accountSkills]);

  const [hideSkillGated, setHideSkillGated] = useUrlParam('marketWide.hideGated', HIDE_SKILL_GATED);
  const gatedCount = useMemo(
    () => rows.filter((row) => skillGateByProductTypeID.get(row.productTypeID)?.gated).length,
    [rows, skillGateByProductTypeID]
  );
  const visibleRows = useMemo(
    () =>
      hideSkillGated
        ? rows.filter((row) => !skillGateByProductTypeID.get(row.productTypeID)?.gated)
        : rows,
    [hideSkillGated, rows, skillGateByProductTypeID]
  );

  const columns: DataTableColumn<MarketWideResultRow>[] = [
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: SORT_VALUE.product,
      render: (row) => {
        const verdict = skillGateByProductTypeID.get(row.productTypeID);
        return (
          <span className="inline-flex items-center gap-1.5">
            <MarketItemLink typeId={row.productTypeID}>{row.productName}</MarketItemLink>
            {verdict?.gated && catalog && (
              <SkillGateMarker
                verdict={verdict}
                nameForSkill={(typeID) => nameForType(catalog, typeID)}
                nameForCharacter={(id) => characterNames.get(id) ?? t('common.unknown')}
              />
            )}
          </span>
        );
      },
    },
    {
      id: 'blueprintSource',
      header: t('industry.marketOpportunitiesBlueprintSource'),
      sortValue: SORT_VALUE.blueprintSource,
      render: (row) => (
        <StatChip
          label={t('industry.marketOpportunitiesBlueprintSource')}
          value={t(`industry.marketOpportunitiesBlueprintSources.${row.blueprintSource}`)}
          tone={row.blueprintSource === 'owned' ? 'success' : 'default'}
        />
      ),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.iskPerHour,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      // Tap, not long press: the ranking's figures are inert — the row's only
      // actions are the button in its last cell and the row's context menu.
      render: (row) =>
        row.iskPerHour === null ? (
          t('common.unknown')
        ) : (
          <IskAmount value={row.iskPerHour} revealOn="tap" decimals={0} />
        ),
    },
    {
      id: 'buildCost',
      header: t('industry.buildCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: SORT_VALUE.buildCost,
      render: (row) => <IskAmount value={row.buildCost} revealOn="tap" decimals={0} />,
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
      sortValue: SORT_VALUE.orderDepth,
      render: (row) => (
        <StatChip
          label={t('industry.opportunitiesOrderDepthLabel')}
          value={t(`industry.opportunitiesOrderDepth.${row.orderDepth}`)}
          tone={ORDER_DEPTH_TONE[row.orderDepth]}
        />
      ),
    },
    {
      id: 'action',
      header: '',
      render: (row) => (
        <Button
          size="sm"
          onClick={() => {
            const entry = catalog?.byProductTypeID.get(row.productTypeID);
            if (entry) onStartPlan(entry);
          }}
        >
          {t('industry.marketOpportunitiesStartPlan')}
        </Button>
      ),
    },
  ];
  const rowContextMenu = (row: MarketWideResultRow, tr: ReactElement): ReactElement => (
    <ItemContextMenu
      typeId={row.productTypeID}
      itemName={row.productName}
      blueprintTypeID={
        catalog
          ? (catalog.byProductTypeID.get(row.productTypeID)?.blueprintTypeID ?? null)
          : undefined
      }
    >
      {tr}
    </ItemContextMenu>
  );
  const sortProps = useUrlSort(
    'marketWide.sort',
    MARKET_WIDE_DEFAULT_SORT,
    columns.map((column) => column.id)
  );

  const unavailableNote =
    hasRun && unavailableSources.length > 0 ? (
      <p className="text-[0.6875rem] text-text-dim">
        {t('industry.marketOpportunitiesSourcesUnavailable', {
          sources: unavailableSources
            .map((source) => t(`industry.marketOpportunitiesBlueprintSources.${source}`))
            .join(', '),
        })}
      </p>
    ) : null;

  return (
    <Panel
      title={t('industry.marketOpportunitiesTitle')}
      meta={
        <InfoTooltip
          label={t('industry.marketOpportunitiesTitle')}
          content={t('industry.marketOpportunitiesLiquidityTooltip')}
        />
      }
      actions={
        <Button size="sm" onClick={run} disabled={loading || !trees || !catalog}>
          {loading
            ? t('industry.marketOpportunitiesScanning')
            : t('industry.marketOpportunitiesRunScan')}
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner label={t('industry.marketOpportunitiesScanning')} />
        </div>
      ) : !hasRun ? (
        <EmptyState
          title={t('industry.marketOpportunitiesEmptyTitle')}
          hint={t('industry.marketOpportunitiesEmptyHint')}
          className="py-8"
        />
      ) : rows.length === 0 ? (
        <div className="flex flex-col gap-2">
          <EmptyState
            title={t('industry.marketOpportunitiesNoResultsTitle')}
            hint={t('industry.marketOpportunitiesNoResultsHint')}
            className="py-8"
          />
          {unavailableNote}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {unavailableNote}
          <AssumesBaseStandingsNote hint={t('industry.assumesBaseStandingsHint')} />
          {gatedCount > 0 && (
            <div className="flex justify-end">
              <FilterChip
                label={t('industry.skillGateFilterChip')}
                selected={hideSkillGated}
                onToggle={() => setHideSkillGated(!hideSkillGated)}
                count={gatedCount}
                countLabel={t('industry.skillGateFilterChipCount', { count: gatedCount })}
              />
            </div>
          )}
          <div className="overflow-x-auto">
            <DataTable
              columns={columns}
              rows={visibleRows}
              rowKey={(row) => row.productTypeID}
              rowContextMenu={rowContextMenu}
              rowMoreActions
              label={t('industry.marketOpportunitiesTitle')}
              mobileSort
              {...sortProps}
            />
          </div>
          {gatedCount > 0 && (
            <p className="text-[0.6875rem] text-text-dim">
              {t('industry.marketOpportunitiesSkillGateRule')}
            </p>
          )}
        </div>
      )}
    </Panel>
  );
}
