import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Disclosure, LiveStatus } from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import { cx } from '@/lib/cx';
import { formatMarketIsk } from '@/lib/isk';
import type { RegionCompetition } from './orderCompetition';
import type { OpenOrderRow } from './openOrdersModel';
import type { OrderDetailView } from './orderDetailView';
import { scopeOrdersCsvColumns, type ScopeOrderCsvRow } from './scopeOrdersCsv';
import {
  scopeCsvRow,
  scopeLabelText,
  tightestRivalScope,
  CELL,
  COLUMN_HEADER,
  type ScopeState,
} from './orderScopeState';
import { ScopeRow } from './OrderScopeRow';

/** "Who is cheaper?" (a buy order: "Who bids higher?"): the station, system and region rivals, and the on-demand deeper check. */
export function OrderWhoCheaperSection({
  row,
  station,
  system,
  region,
  deep,
  loadingDeep,
  regionJumps,
  stationNameFor,
  expanded,
  onToggle,
  onCheckDeeper,
}: {
  row: OpenOrderRow;
  station: ScopeState;
  system: ScopeState;
  region: ScopeState;
  deep: RegionCompetition | null;
  loadingDeep: boolean;
  regionJumps: OrderDetailView['regionJumps'];
  stationNameFor: OrderDetailView['stationNameFor'];
  expanded: boolean;
  onToggle: () => void;
  onCheckDeeper: () => void;
}) {
  const { t } = useTranslation();
  const showCheckDeeper = deep === null && !loadingDeep;
  const whoTableRef = useRef<HTMLDivElement>(null);
  const allClean =
    !row.isBuyOrder &&
    station.kind === 'clear' &&
    (system.kind === 'clear' || system.kind === 'unavailable' || system.kind === 'notChecked') &&
    region.kind === 'clear';

  const whoTrailing = (() => {
    const tightest = tightestRivalScope(station, system, region);
    if (tightest === 'clear') return t('market.orders.trailingClear');
    if (tightest === 'notChecked') return t('market.orders.trailingNotChecked');
    return `${scopeLabelText(tightest.scope, t)} · ${formatMarketIsk(tightest.price)}`;
  })();
  const whoLabel = t(row.isBuyOrder ? 'market.orders.whoBidsHigher' : 'market.orders.whoIsCheaper');

  // The grid below is a div table, not a DataTable, so it exports these rows
  // as built — same order, own order last.
  const scopeCsvRows: ScopeOrderCsvRow[] = [
    scopeCsvRow('station', station, t, {
      stationName: row.stationName,
      distance: t('market.orders.scopeSameStation'),
    }),
    scopeCsvRow('system', system, t, {
      stationName: system.kind === 'rival' ? stationNameFor(system.rival.locationId) : undefined,
      distance: t('market.orders.scopeSameSystem'),
    }),
    scopeCsvRow('region', region, t, {
      stationName: region.kind === 'rival' ? stationNameFor(region.rival.locationId) : undefined,
      jumps: regionJumps,
    }),
    {
      scope: t('market.orders.scopeMyOrder'),
      seller: row.stationName ?? t('market.unknownStructure'),
      price: row.price,
      gapIsk: null,
      gapPct: null,
      distance: null,
    },
  ];
  const scopeCsvColumns = useMemo(() => scopeOrdersCsvColumns(t), [t]);
  const scopeExport = useTableExport({
    surface: 'market-scope-orders',
    rows: scopeCsvRows,
    columns: scopeCsvColumns,
    source: 'rows',
  });

  return (
    <section>
      <Disclosure label={whoLabel} trailing={whoTrailing} expanded={expanded} onToggle={onToggle}>
        {/* The Disclosure's own header is its toggle button, so the grid's ⋯
                  menu heads the panel it opens instead. */}
        <div className="flex items-center justify-between gap-2 pr-1.5">
          <p className="px-2.5 pt-1.5 text-[0.6875rem] text-text-dim">
            {t('market.orders.scopeTightestBites')}
          </p>
          <TableActionsMenu name={whoLabel} tableExport={scopeExport} />
        </div>
        {/*
                ONE grid so the price column lines up down the table. Rows are
                `display: contents` + `role="row"` (still a table to assistive
                tech), so the row rule and "my order" tint paint per cell.
              */}
        <div
          ref={whoTableRef}
          tabIndex={-1}
          role="table"
          aria-label={whoLabel}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] text-xs focus:outline-none"
        >
          <div role="row" className="contents">
            <span role="columnheader" className={cx(COLUMN_HEADER, 'pl-3')}>
              {t('market.orders.scopeColumn')}
            </span>
            <span role="columnheader" className={COLUMN_HEADER}>
              {t('market.orders.scopeCheapestSeller')}
            </span>
            <span role="columnheader" className={cx(COLUMN_HEADER, 'pr-3 text-right')}>
              {t('market.orders.scopeTheirPrice')}
            </span>
          </div>
          <ScopeRow
            scope="station"
            state={station}
            stationName={row.stationName}
            distance={t('market.orders.scopeSameStation')}
          />
          <ScopeRow
            scope="system"
            state={system}
            stationName={
              system.kind === 'rival' ? stationNameFor(system.rival.locationId) : undefined
            }
            distance={t('market.orders.scopeSameSystem')}
          />
          <ScopeRow
            scope="region"
            state={region}
            stationName={
              region.kind === 'rival' ? stationNameFor(region.rival.locationId) : undefined
            }
            jumps={regionJumps}
          />
          {/* My own order last, as the line every row above is measured against. */}
          <div role="row" className="contents">
            <span
              role="rowheader"
              className={cx(
                CELL,
                'bg-panel pl-3 font-semibold tracking-widest text-accent uppercase'
              )}
            >
              {t('market.orders.scopeMyOrder')}
            </span>
            <span role="cell" className={cx(CELL, 'bg-panel')}>
              {row.stationName ?? t('market.unknownStructure')}
            </span>
            <span role="cell" className={cx(CELL, 'bg-panel pr-3 text-right tabular-nums')}>
              {formatMarketIsk(row.price)}
            </span>
          </div>
        </div>
        <div className="px-3 pb-2">
          <LiveStatus>{loadingDeep ? t('market.orders.checkingDeeper') : null}</LiveStatus>
          {allClean && (
            <p className="pt-1.5 text-xs text-success">{t('market.orders.onlySeller')}</p>
          )}
          {deep?.truncated && (
            // A truncated fetch isn't the pre-fetch state (the button below
            // stays hidden, same as any other resolved `deep`) — say why
            // system/region above read "not checked" instead of leaving the
            // user to wonder where the "check deeper" button went. Same
            // key/shape `VariationsTable.tsx` uses for its own truncated fetch.
            <p className="pt-1.5 text-[0.6875rem] text-warning uppercase">
              {t('common.incompleteTitle')}
            </p>
          )}
          {showCheckDeeper && (
            <p className="pt-2">
              <Button
                size="sm"
                onClick={() => {
                  // The button unmounts; keep focus inside the dialog.
                  whoTableRef.current?.focus({ preventScroll: true });
                  onCheckDeeper();
                }}
              >
                {t('market.orders.checkDeeper')}
              </Button>
            </p>
          )}
          {loadingDeep && (
            <p aria-hidden="true" className="pt-1.5 text-xs text-text-dim">
              {t('market.orders.checkingDeeper')}
            </p>
          )}
        </div>
      </Disclosure>
    </section>
  );
}
