/**
 * Market-Wide Build Opportunities (issue #819): a second panel on the
 * Opportunities tab, ranking manufacturable products market-wide by
 * ISK/hour, independent of ownership — a cold-start "what should I build,
 * starting from nothing" answer. Opt-in: nothing runs until the pilot hits
 * "Scan".
 */
import { useMemo, useState } from 'react';
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
import { evaluateSkillGate, type SkillGateVerdict } from '@/engine/industry/skillGate';
import type { OrderDepthLevel } from '@/engine/industry/opportunities';
import type { MarketWideTreeMap } from '@/sde/types';
import type { TradeHub } from '@/market/hubs';
import { useAccountSkillLevels } from '@/features/skills/useAccountSkillLevels';
import { nameForType, type BlueprintCatalog, type BlueprintCatalogEntry } from './blueprintCatalog';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { useMarketWideOpportunities } from './useMarketWideOpportunities';
import { SkillGateMarker } from './SkillGateMarker';

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
  onStartPlan: (entry: BlueprintCatalogEntry) => void;
}

export function MarketWideOpportunitiesPanel({
  hub,
  trees,
  catalog,
  modifiers,
  onStartPlan,
}: MarketWideOpportunitiesPanelProps) {
  const { t } = useTranslation();
  const { rows, loading, hasRun, run } = useMarketWideOpportunities({
    hub,
    trees,
    catalog,
    modifiers,
  });

  // Account-wide, not active-character: every character on the account, same
  // precedent `OpportunitiesPanel`'s own multi-character fan-out sets.
  const allCharacters = useLiveQuery(() => db.characters.toArray(), [], []);
  const characterNames = useMemo(
    () => new Map((allCharacters ?? []).map((c) => [c.characterId, c.name])),
    [allCharacters]
  );
  const characterIds = [...characterNames.keys()];
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

  const [hideSkillGated, setHideSkillGated] = useState(false);
  const gatedCount = useMemo(
    () => rows.filter((row) => skillGateByProductTypeID.get(row.productTypeID)?.gated).length,
    [rows, skillGateByProductTypeID]
  );
  const visibleRows = hideSkillGated
    ? rows.filter((row) => !skillGateByProductTypeID.get(row.productTypeID)?.gated)
    : rows;

  const columns: DataTableColumn<MarketWideResultRow>[] = [
    {
      id: 'product',
      header: t('industry.product'),
      primary: true,
      sortValue: (row) => row.productName,
      render: (row) => {
        const verdict = skillGateByProductTypeID.get(row.productTypeID);
        return (
          <span className="inline-flex items-center gap-1.5">
            {row.productName}
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
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.iskPerHour ?? undefined,
      cellClassName: (row) => (row.iskPerHour !== null ? iskToneClass(row.iskPerHour) : undefined),
      // Tap, not long press: the ranking's figures are inert — the row's only
      // action is the button in its last cell.
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
      sortValue: (row) => row.buildCost,
      render: (row) => <IskAmount value={row.buildCost} revealOn="tap" decimals={0} />,
    },
    {
      id: 'orderDepth',
      header: t('industry.opportunitiesOrderDepthLabel'),
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
        <EmptyState
          title={t('industry.marketOpportunitiesNoResultsTitle')}
          hint={t('industry.marketOpportunitiesNoResultsHint')}
          className="py-8"
        />
      ) : (
        <div className="flex flex-col gap-2">
          {gatedCount > 0 && (
            <div className="flex justify-end">
              <FilterChip
                label={t('industry.skillGateFilterChip')}
                selected={hideSkillGated}
                onToggle={() => setHideSkillGated((v) => !v)}
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
              label={t('industry.marketOpportunitiesTitle')}
              defaultSort={{ columnId: 'iskPerHour', direction: 'desc' }}
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
