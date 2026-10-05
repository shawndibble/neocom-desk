/** The whole demand: every chain line, how much is made, and from where. */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { DataTable, Panel, type DataTableColumn } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import type { DemandLine, DemandSource, PlanetType } from '@/engine/pi/goalTypes';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { TierChip } from '../DirectiveRow';
import { commodityName, formatUnits } from '../goalPlannerFormat';
import { HOURS_PER_DAY, PERCENT_FORMAT, planetTypesText, type PlanNames } from './format';

/** Under this short of one, a made fraction is float dust. */
const WHOLE = 0.995;

/** The source, with how much is made where the line is partial. */
function sourceLabel(line: DemandLine, t: TFunction): string {
  const percent = PERCENT_FORMAT.format(line.madeFraction * 100);
  if (line.source === 'bought') {
    // The tier names what is bought; a part made as well is said alongside.
    return line.madeFraction > 1 - WHOLE
      ? t('piPlan.sourceBoughtPartial', { tier: line.tier, percent })
      : t('piPlan.sourceBoughtTier', { tier: line.tier });
  }
  if (line.source === 'short' && line.madeFraction > 1 - WHOLE) {
    return t('piPlan.sourceShortPartial', { percent });
  }
  if ((line.source === 'made' || line.source === 'extracted') && line.madeFraction < WHOLE) {
    return t('piPlan.sourceHeldBack', { percent });
  }
  return sourceText(line.source, t);
}

function sourceText(source: DemandSource, t: TFunction): string {
  switch (source) {
    case 'made':
      return t('piPlan.sourceMade');
    case 'bought':
      return t('piPlan.sourceBought');
    case 'short':
      return t('piPlan.sourceShort');
    case 'extracted':
      return t('piPlan.sourceExtracted');
    case 'not-extracted':
      return t('piPlan.sourceNotExtracted');
    case 'blocked':
      return t('piPlan.sourceBlocked');
  }
}

const SOURCE_TONE: Record<DemandSource, string> = {
  made: 'text-text',
  extracted: 'text-text',
  'not-extracted': 'text-text-dim',
  bought: 'text-warning',
  short: 'text-danger',
  blocked: 'text-text-dim',
};

export function Flow({
  demand,
  typeGaps,
  names,
}: {
  demand: readonly DemandLine[];
  /** The plan's type gaps by P0, for naming what blocks the blocked goals. */
  typeGaps: ReadonlyMap<number, readonly PlanetType[]>;
  names: PlanNames;
}) {
  const { t } = useTranslation();
  const { pi, hub } = names;
  // The live chain first, the blocked goals' chain folded below it: a type
  // both need then reads as two lines in two places, not a duplicate.
  const rows = useMemo(
    () => [
      ...demand.filter((line) => line.source !== 'blocked'),
      ...demand.filter((line) => line.source === 'blocked'),
    ],
    [demand]
  );
  const columns = useMemo<DataTableColumn<DemandLine>[]>(
    () => [
      {
        id: 'item',
        header: t('piPlan.flowItem'),
        primary: true,
        sortValue: (line) => commodityName(line.typeId, pi),
        render: (line) => (
          <span className="inline-flex items-center gap-2">
            <TierChip tier={line.tier} />
            <MarketItemLink typeId={line.typeId} hubId={hub.id}>
              {commodityName(line.typeId, pi)}
            </MarketItemLink>
          </span>
        ),
      },
      {
        id: 'perDay',
        header: t('piPlan.flowPerDay'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (line) => line.unitsPerHour,
        render: (line) => formatUnits(Math.round(line.unitsPerHour * HOURS_PER_DAY)),
      },
      {
        id: 'perHour',
        header: t('piPlan.flowPerHour'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (line) => line.unitsPerHour,
        render: (line) => formatUnits(line.unitsPerHour),
      },
      {
        id: 'factories',
        header: t('piPlan.flowFactories'),
        headerTooltip: t('piPlan.flowFactoriesTooltip'),
        align: 'right',
        className: 'tabular-nums',
        sortValue: (line) => line.factories ?? -1,
        render: (line) => (line.factories === null ? '—' : String(line.factories)),
      },
      {
        id: 'source',
        header: t('piPlan.flowSource'),
        sortValue: (line) => line.source,
        render: (line) => {
          const heldBack =
            (line.source === 'made' || line.source === 'extracted') && line.madeFraction < WHOLE;
          return (
            <span
              className={heldBack ? 'text-warning' : SOURCE_TONE[line.source]}
              title={heldBack ? t('piPlan.sourceHeldBackTooltip') : undefined}
            >
              {sourceLabel(line, t)}
            </span>
          );
        },
      },
    ],
    [t, pi, hub]
  );
  const tableExport = useTableExport({
    surface: 'pi-plan-flow',
    rows,
    columns: [
      { header: t('piPlan.flowTier'), value: (line) => `P${line.tier}` },
      { header: t('piPlan.flowItem'), value: (line) => commodityName(line.typeId, pi) },
      { header: t('piPlan.flowPerDay'), value: (line) => line.unitsPerHour * HOURS_PER_DAY },
      { header: t('piPlan.flowPerHour'), value: (line) => line.unitsPerHour },
      { header: t('piPlan.flowFactories'), value: (line) => line.factories ?? '' },
      { header: t('piPlan.flowSource'), value: (line) => sourceLabel(line, t) },
    ],
  });
  if (demand.length === 0) return null;
  return (
    <Panel
      title={t('piPlan.flowTitle')}
      actions={<TableActionsMenu name={t('piPlan.flowTitle')} tableExport={tableExport} />}
      padded={false}
    >
      <DataTable
        {...tableExport.tableProps}
        label={t('piPlan.flowTableLabel')}
        columns={columns}
        rows={rows}
        rowKey={(line) => `${line.typeId}:${line.source}`}
        rowClassName={(line) => (line.source === 'blocked' ? 'text-text-dim' : undefined)}
        groupBy={{
          key: (line) => (line.source === 'blocked' ? 'blocked' : null),
          renderHeader: (lines) => {
            const p0s = [...new Set(lines.flatMap((line) => line.blockedBy ?? []))].sort(
              (a, b) => a - b
            );
            const needs = p0s
              .filter((p0) => typeGaps.has(p0))
              .map((p0) =>
                t('piPlan.blockedNeed', {
                  types: planetTypesText(typeGaps.get(p0) ?? [], t),
                  p0: commodityName(p0, pi),
                })
              );
            return needs.length > 0
              ? t('piPlan.flowBlockedGroup', {
                  count: lines.length,
                  needs: needs.join(t('piPlan.and')),
                })
              : t('piPlan.flowBlockedGroupPlain', { count: lines.length });
          },
          defaultExpanded: () => true,
          allWidths: true,
          minSize: 1,
        }}
        density="compact"
        stackColumns={2}
        rowContextMenu={(line, tr) => (
          <ItemContextMenu typeId={line.typeId} itemName={commodityName(line.typeId, pi)}>
            {tr}
          </ItemContextMenu>
        )}
      />
    </Panel>
  );
}
