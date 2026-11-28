import { createNumberFormat } from '@/lib/numberLocale';
import { formatCount } from '@/lib/formatCount';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { entityLinkClassName } from '@/components/ui/entityLinkClassName';
import { onPlanLinkClick, planHref } from './planLinkClick';
import type { CharacterModifiers } from '@/engine/industry/characterModifiers';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ColumnPickerMenu,
  DataTable,
  InfoTooltip,
  IskAmount,
  Panel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import type { BuildPlanRecord } from '@/db';
import type { CharacterBlueprint } from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { formatDuration } from '@/lib/duration';
import { iskToneClass } from '@/features/character/format';
import { AssumesBaseStandingsNote } from '@/features/character/AssumesBaseStandingsNote';
import type { BlueprintCatalog } from './blueprintCatalog';
import type { HubOrderCounts } from '@/market/fuzzwork';
import { formatPercent } from './format';
import { useComparedBuildResults, type ComparedBuildRow } from './useComparedBuildResults';
import type { BuildPlanPricingInputs } from './buildPlanPricingInputs';
import { buildPlanCompareCsvColumns } from './buildPlanCompareCsv';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { useColumnVisibility } from '@/lib/columnVisibility';
import { TRADE_HUBS } from '@/market/hubs';
import {
  COMPARE_COLUMN_IDS,
  COMPARE_DEFAULT_COLUMNS,
  HUB_BOOK_COLUMN_IDS,
  HUB_COLUMN_IDS,
  PLAN_HUB,
  useCompareHub,
  useVisibleCompareColumns,
  type CompareColumnId,
  type CompareHubChoice,
} from './compareColumns';
import { hubOrderKey, useHubOrderCounts, type HubOrderTarget } from './useHubOrderCounts';
import { useHubDailyOrders } from './useHubDailyOrders';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useIsDesktop } from '@/lib/useIsDesktop';
import { CompareMatrix } from './CompareMatrix';
import { TableScroll } from '@/components/ui/TableScroll';

const formatOnePlace = createNumberFormat({ maximumFractionDigits: 1 });

interface BuildPlanCompareProps {
  plans: readonly BuildPlanRecord[];
  catalog: BlueprintCatalog;
  pi: PiData | null;
  ownedBlueprints: readonly CharacterBlueprint[];
  modifiers: CharacterModifiers;
  pricingInputs: BuildPlanPricingInputs;
  onDone: () => void;
  onOpenPlan: (planId: string) => void;
}

function numericCell(
  row: ComparedBuildRow,
  value: number | null | undefined,
  format: (v: number) => ReactNode,
  unknown: string
): ReactNode {
  if (row.loading) return '…';
  if (value === null || value === undefined) return unknown;
  return format(value);
}

function unresolvedReason(
  row: ComparedBuildRow,
  t: (key: string, options?: Record<string, unknown>) => string
): string | null {
  if (row.error) return row.error;
  if (row.result?.unpriceable) {
    return row.result.unpricedMaterials.length > 0
      ? t('industry.unpricedMaterialsWarning', { count: row.result.unpricedMaterials.length })
      : t('industry.productUnpriced', { name: row.productName });
  }
  return null;
}

export function BuildPlanCompare({
  plans,
  catalog,
  pi,
  ownedBlueprints,
  modifiers,
  pricingInputs,
  onDone,
  onOpenPlan,
}: BuildPlanCompareProps) {
  const { t } = useTranslation();
  const isDesktop = useIsDesktop();
  const hubChoice = useCompareHub((state) => state.value);
  const pricedPlans = useMemo(
    () => (hubChoice === PLAN_HUB ? plans : plans.map((plan) => ({ ...plan, hubId: hubChoice }))),
    [plans, hubChoice]
  );
  const rows = useComparedBuildResults({
    plans: pricedPlans,
    catalog,
    pi,
    ownedBlueprints,
    modifiers,
    pricingInputs,
  });
  const unknown = t('common.unknown');
  const { visible, isVisible, toggle, reset } = useColumnVisibility(
    useVisibleCompareColumns,
    COMPARE_DEFAULT_COLUMNS
  );
  const setHubChoice = useCompareHub((state) => state.setValue);
  useHydratedStore(useCompareHub);

  const showHubColumns = HUB_COLUMN_IDS.some(isVisible);
  const showBookColumns = HUB_BOOK_COLUMN_IDS.some(isVisible);
  const targets = useMemo(() => {
    const byPlan = new Map<string, HubOrderTarget>();
    for (const plan of pricedPlans) {
      const typeId = catalog.byBlueprintTypeID.get(plan.blueprintTypeID)?.productTypeID;
      if (typeId == null) continue;
      byPlan.set(plan.id, { hubId: plan.hubId, typeId });
    }
    return byPlan;
  }, [pricedPlans, catalog]);
  const anyResolved = rows.some((row) => !row.loading);
  const wantHub = anyResolved || showBookColumns;
  const hubOrders = useHubOrderCounts([...targets.values()], wantHub);
  const hubCountsFor = (row: ComparedBuildRow) => {
    const target = targets.get(row.planId);
    return target ? hubOrders.counts.get(hubOrderKey(target.hubId, target.typeId)) : undefined;
  };

  const dailyOrders = useHubDailyOrders([...targets.values()], wantHub);
  const ordersPerDayFor = (row: ComparedBuildRow) => {
    const target = targets.get(row.planId);
    return target ? dailyOrders.perDay.get(hubOrderKey(target.hubId, target.typeId)) : undefined;
  };

  const csvColumns = buildPlanCompareCsvColumns(t, {
    hubCounts: hubCountsFor,
    ordersPerDay: ordersPerDayFor,
    unresolvedReason: (row) => unresolvedReason(row, t),
  });
  const compareExport = useTableExport({
    surface: 'build-plan-compare',
    rows,
    columns: csvColumns,
    truncated: hubOrders.loading || dailyOrders.loading,
  });

  const hubCell = (row: ComparedBuildRow, pick: (c: HubOrderCounts) => number): ReactNode => {
    if (row.loading || hubOrders.loading) return '…';
    const counts = hubCountsFor(row);
    return counts ? formatCount(pick(counts)) : unknown;
  };
  const hubSort = (row: ComparedBuildRow, pick: (c: HubOrderCounts) => number) => {
    const counts = hubCountsFor(row);
    return counts ? pick(counts) : undefined;
  };

  const columns: DataTableColumn<ComparedBuildRow>[] = [
    {
      id: 'plan',
      header: t('industry.comparePlanColumn'),
      primary: true,
      stickyStart: true,
      sortValue: (row) => row.planName,
      render: (row) => {
        const reason = row.loading ? null : unresolvedReason(row, t);
        return (
          <span className="flex items-center gap-1.5">
            <Link
              to={planHref(row.planId)}
              onClick={onPlanLinkClick(() => onOpenPlan(row.planId))}
              className={entityLinkClassName('truncate text-left')}
            >
              {row.planName}
            </Link>
            {reason && (
              <InfoTooltip
                label={t('industry.compareUnresolvedFor', { plan: row.planName })}
                content={reason}
              />
            )}
          </span>
        );
      },
    },
    {
      id: 'product',
      header: t('industry.product'),
      sortValue: (row) => row.productName,
      render: (row) => row.productName,
    },
    {
      id: 'runs',
      header: t('industry.runs'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.runs,
      render: (row) => row.runs,
    },
    {
      id: 'duration',
      header: t('industry.time'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.seconds ?? undefined,
      render: (row) => numericCell(row, row.result?.seconds ?? null, formatDuration, unknown),
    },
    {
      id: 'materialCost',
      header: t('industry.materialCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.materialCost ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.materialCost ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'jobFee',
      header: t('industry.jobFee'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.jobFee.total ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.jobFee.total ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'totalCost',
      header: t('industry.totalCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.totalCost ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.totalCost ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'revenue',
      header: t('industry.revenue'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.revenue ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.revenue ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'profit',
      header: t('industry.profit'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.profit ?? undefined,
      cellClassName: (row) =>
        row.result?.profit != null ? iskToneClass(row.result.profit) : undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.profit ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'margin',
      header: t('industry.margin'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.marginPct ?? undefined,
      render: (row) => numericCell(row, row.result?.marginPct ?? null, formatPercent, unknown),
    },
    {
      id: 'iskPerHour',
      header: t('industry.iskPerHour'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.iskPerHour ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.iskPerHour ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'breakEvenPrice',
      header: t('industry.breakEvenPrice'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.breakEvenPrice ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.breakEvenPrice ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'buyCost',
      header: t('industry.compareBuyCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => row.result?.buyCost ?? undefined,
      render: (row) =>
        numericCell(
          row,
          row.result?.buyCost ?? null,
          (v) => <IskAmount value={v} decimals={0} />,
          unknown
        ),
    },
    {
      id: 'hubOrdersPerDay',
      header: t('industry.compareHubOrdersPerDay'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => ordersPerDayFor(row),
      render: (row) => {
        if (row.loading || dailyOrders.loading) return '…';
        const perDay = ordersPerDayFor(row);
        return perDay === undefined ? unknown : formatOnePlace(perDay);
      },
    },
    {
      id: 'hubBuyOrders',
      header: t('industry.compareHubBuyOrders'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => hubSort(row, (c) => c.buyOrders),
      render: (row) => hubCell(row, (c) => c.buyOrders),
    },
    {
      id: 'hubSellOrders',
      header: t('industry.compareHubSellOrders'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => hubSort(row, (c) => c.sellOrders),
      render: (row) => hubCell(row, (c) => c.sellOrders),
    },
    {
      id: 'hubBuyVolume',
      header: t('industry.compareHubBuyVolume'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => hubSort(row, (c) => c.buyVolume),
      render: (row) => hubCell(row, (c) => c.buyVolume),
    },
    {
      id: 'hubSellVolume',
      header: t('industry.compareHubSellVolume'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (row) => hubSort(row, (c) => c.sellVolume),
      render: (row) => hubCell(row, (c) => c.sellVolume),
    },
  ];

  const columnsById = Object.fromEntries(columns.map((c) => [c.id, c])) as Record<
    CompareColumnId,
    DataTableColumn<ComparedBuildRow>
  >;
  const shownColumns = columns.filter((c) => c.id === 'plan' || isVisible(c.id as CompareColumnId));

  return (
    <Panel
      title={t('industry.compareTitle')}
      actions={
        <span className="flex items-center gap-2">
          <Select
            value={hubChoice}
            onValueChange={(value) => void setHubChoice(value as CompareHubChoice)}
          >
            <SelectTrigger size="sm" aria-label={t('industry.compareHubPicker')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={PLAN_HUB}>{t('industry.comparePlanHub')}</SelectItem>
              {TRADE_HUBS.map((hub) => (
                <SelectItem key={hub.id} value={hub.id}>
                  {hub.systemName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ColumnPickerMenu
            available={COMPARE_COLUMN_IDS}
            visible={visible}
            columnsById={columnsById}
            onToggle={toggle}
            onReset={reset}
            size="sm"
            buttonLabel={t('common.columnsButton')}
            menuTitle={t('common.columnsMenuTitle')}
            resetLabel={t('common.resetColumns')}
          />
          <TableActionsMenu name={t('industry.compareTitle')} tableExport={compareExport} />
          <Button size="sm" onClick={onDone}>
            {t('industry.compareDone')}
          </Button>
        </span>
      }
    >
      <AssumesBaseStandingsNote hint={t('industry.assumesBaseStandingsHint')} />
      {showHubColumns && (
        <p className="mb-2 text-xs text-text-dim">
          {showBookColumns && hubOrders.failed
            ? t('industry.compareHubFailed')
            : t('industry.compareHubOrdersHint')}
        </p>
      )}
      {isDesktop ? (
        <TableScroll>
          <DataTable
            {...compareExport.tableProps}
            columns={shownColumns}
            rows={rows}
            rowKey={(row) => row.planId}
            label={t('industry.compareTableLabel')}
            defaultSort={{ columnId: 'plan', direction: 'asc' }}
          />
        </TableScroll>
      ) : (
        <CompareMatrix
          columns={shownColumns}
          rows={rows}
          rowKey={(row) => row.planId}
          label={t('industry.compareTableLabel')}
          emphasisColumnId="profit"
        />
      )}
    </Panel>
  );
}
