import { useMemo, useState, type ReactNode } from 'react';
import { useTimeZone } from '@/lib/timeFormat';
import { useIsPhone } from '@/lib/useIsPhone';
import { formatTimestamp } from '@/lib/timestamp';
import { useTranslation } from 'react-i18next';
import {
  DataTable,
  EmptyState,
  IskAmount,
  StatChip,
  StatChips,
  type DataTableColumn,
} from '@/components/ui';
import { TableActionsMenu } from '@/components/ui/TableExport';
import { useTableExport } from '@/components/ui/useTableExport';
import {
  buildAppraisal,
  type AppraisalItem,
  type AppraisalRow,
  type RefineBasis,
} from '@/engine/market/appraisal';
import { pileFigures, rowFigures } from '@/engine/market/appraisalRowFigures';
import { basisAvailable, refineEfficiencyRange } from '@/engine/market/refineBreakdown';
import { ShareShell, type OpenInApp } from '@/features/share/ShareShell';
import { formatIskAuto } from '@/lib/isk';
import { appraisalCsvColumns } from './appraisalCsv';
import type { AppraisalShareView } from './appraisalShareData';
import { formatVolume } from './format';
import { FullIskTotal } from './FullIskTotal';
import { RefineBreakdownModal } from './RefineBreakdownModal';
import { RefineChipValue } from './RefineChipValue';
import { comparisonCell } from './appraisalCells';
import { RefineFigureButton } from './RefineFigureButton';
import { efficiencyText } from './refineFormat';
import { useMyRefine } from './useMyRefine';
import { useRefineBasis } from './refineBasis';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useRefineMineralNames } from './useRefineMineralNames';

const NO_ROWS: readonly AppraisalRow[] = [];
const NO_ITEMS: readonly AppraisalItem[] = [];

function eachCell(value: number | null): string {
  if (value === null) return '—';
  return formatIskAuto(value);
}

function totalCell(value: number | null): ReactNode {
  if (value === null) return '—';
  return <IskAmount value={value} decimals={0} />;
}

export type AppraisalShareState =
  { status: 'invalid' } | { status: 'ready'; view: AppraisalShareView };

interface AppraisalShareScreenProps {
  state: AppraisalShareState;
  expiresAt: number;
  openInApp?: OpenInApp;
}

export function AppraisalShareScreen({ state, expiresAt, openInApp }: AppraisalShareScreenProps) {
  const { t } = useTranslation();
  const timeZone = useTimeZone();
  const isPhone = useIsPhone();
  const view = state.status === 'ready' ? state.view : null;
  const [refineModal, setRefineModal] = useState<{ typeId: number | null } | null>(null);
  const [source, setSource] = useState<'shared' | 'mine'>('shared');
  const [askedForMine, setAskedForMine] = useState(false);
  const mine = useMyRefine(view, askedForMine || refineModal !== null);
  const usingMine = source === 'mine' && mine.status === 'ready';
  const appraisal = useMemo(() => {
    if (view === null) return null;
    return usingMine ? buildAppraisal(mine.items, view.pricePercent) : view.appraisal;
  }, [view, usingMine, mine]);
  const setup = usingMine
    ? { yieldRate: mine.setup.stationRate, taxRate: mine.setup.taxRate }
    : (view?.refining ?? null);
  const storedBasis = useRefineBasis((state) => state.value);
  const setStoredBasis = useRefineBasis((state) => state.setValue);
  const basisReady = useHydratedStore(useRefineBasis);
  const refineBasis: RefineBasis =
    appraisal !== null && basisAvailable(appraisal, storedBasis) ? storedBasis : 'buy';
  const pile = appraisal === null ? null : pileFigures(appraisal.rows, refineBasis);
  const hasRefine = basisReady && setup !== null && (pile?.refinable ?? false);
  const figures = (row: AppraisalRow) => rowFigures(row, refineBasis, null);
  const refineRange = hasRefine && appraisal ? refineEfficiencyRange(appraisal.items) : null;
  const refineEfficiency = refineRange ? efficiencyText(refineRange.min, refineRange.max) : null;
  const shareRows = appraisal ? appraisal.rows : NO_ROWS;
  const loadedNames = useRefineMineralNames(appraisal?.items ?? NO_ITEMS);
  const mineralNames = useMemo(() => {
    const names = new Map(loadedNames);
    for (const [typeId, name] of view?.mineralNames ?? []) if (name !== '') names.set(typeId, name);
    return names;
  }, [loadedNames, view]);
  const csvColumns = useMemo(() => appraisalCsvColumns(t), [t]);
  const tableExport = useTableExport({
    surface: 'appraisal-shared',
    rows: shareRows,
    columns: csvColumns,
  });

  function totalFigure(value: number): ReactNode {
    return isPhone ? <IskAmount value={value} decimals={0} /> : <FullIskTotal value={value} />;
  }

  const columns: DataTableColumn<AppraisalRow>[] = [
    {
      id: 'item',
      header: t('market.appraisal.columnItem'),
      stickyStart: true,
      render: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: 'quantity',
      header: t('market.appraisal.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => formatVolume(row.quantity),
      sortValue: (row) => row.quantity,
    },
    {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      phoneHidden: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.buyEach),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      phoneHidden: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.sellEach),
      sortValue: (row) => row.sellEach ?? undefined,
    },
    {
      id: 'splitEach',
      header: t('market.appraisal.columnSplitEach'),
      headerTooltip: t('market.appraisal.columnSplitEachHelp'),
      phoneHidden: true,
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(figures(row).splitEach),
      sortValue: (row) => figures(row).splitEach ?? undefined,
    },
    {
      id: 'buyTotal',
      header: t('market.appraisal.columnBuyTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => totalCell(row.buyTotal),
      sortValue: (row) => row.buyTotal ?? undefined,
    },
    {
      id: 'sellTotal',
      header: t('market.appraisal.columnSellTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => totalCell(row.sellTotal),
      sortValue: (row) => row.sellTotal ?? undefined,
    },
    ...(hasRefine
      ? [
          {
            id: 'refineTotal',
            header: t('market.appraisal.columnRefineTotal'),
            align: 'right' as const,
            className: 'whitespace-nowrap tabular-nums',
            render: (row: AppraisalRow) => {
              const { minerals, verdict } = figures(row).refine;
              return minerals === undefined
                ? '—'
                : comparisonCell(
                    <RefineFigureButton
                      name={row.name}
                      onOpen={() => setRefineModal({ typeId: row.typeId })}
                    >
                      {totalCell(minerals)}
                    </RefineFigureButton>,
                    verdict === 'refine'
                  );
            },
            sortValue: (row: AppraisalRow) => figures(row).refine.minerals,
          },
          {
            id: 'refineWithLeftover',
            header: t('market.appraisal.columnRefineWithLeftover'),
            align: 'right' as const,
            className: 'whitespace-nowrap tabular-nums',
            render: (row: AppraisalRow) => {
              const { withLeftover, verdict } = figures(row).refine;
              return withLeftover === undefined
                ? '—'
                : comparisonCell(totalCell(withLeftover), verdict === 'refine');
            },
            sortValue: (row: AppraisalRow) => figures(row).refine.withLeftover,
          },
        ]
      : []),
  ];

  return (
    <ShareShell title={t('appraisalShare.title')} openInApp={openInApp}>
      {state.status === 'invalid' && (
        <EmptyState
          title={t('appraisalShare.invalidTitle')}
          hint={t('appraisalShare.invalidHint')}
          className="py-10"
        />
      )}

      {state.status === 'ready' && (
        <>
          <div className="flex items-start justify-between gap-3 border-b border-line px-1 py-2">
            <StatChips className="min-w-0 flex-1">
              <StatChip
                label={state.view.hub.systemName}
                value={t('market.appraisal.atPercent', { pricePercent: state.view.pricePercent })}
              />
              <StatChip
                label={t('market.appraisal.sellTotal')}
                value={totalFigure(state.view.appraisal.totals.sell)}
                tone="accent"
              />
              <StatChip
                label={t('market.appraisal.buyTotal')}
                value={totalFigure(state.view.appraisal.totals.buy)}
              />
              {hasRefine && pile && (
                <StatChip
                  label={t('market.appraisal.refineTotal')}
                  value={
                    <RefineChipValue
                      amount={<IskAmount value={pile.refineMinerals} decimals={0} />}
                      basis={t(`market.appraisal.refineBasisShort.${refineBasis}`)}
                      efficiency={refineEfficiency}
                      onOpen={() => setRefineModal({ typeId: null })}
                    />
                  }
                />
              )}
            </StatChips>
            {shareRows.length > 0 && (
              <TableActionsMenu name={t('appraisalShare.title')} tableExport={tableExport} />
            )}
          </div>

          {shareRows.length === 0 ? (
            <EmptyState
              title={t('market.appraisal.noMatchesTitle')}
              hint={t('market.appraisal.noMatchesHint')}
              className="py-10"
            />
          ) : (
            <div className="overflow-x-auto">
              <DataTable
                {...tableExport.tableProps}
                columns={columns}
                rows={shareRows}
                rowKey={(row) => row.typeId}
                label={t('appraisalShare.title')}
                responsive="table"
              />
            </div>
          )}

          <StatChips className="border-t border-line px-1 py-2">
            <StatChip
              label={t('appraisalShare.generatedLabel')}
              value={formatTimestamp(new Date(state.view.generatedAt * 1000), timeZone)}
            />
            <StatChip
              label={t('appraisalShare.expiresLabel')}
              value={formatTimestamp(new Date(expiresAt), timeZone)}
            />
          </StatChips>
          {refineModal !== null && view !== null && appraisal !== null && setup !== null && (
            <RefineBreakdownModal
              open
              onClose={() => setRefineModal(null)}
              appraisal={appraisal}
              pricePercent={view.pricePercent}
              hubName={view.hub.systemName}
              setup={setup}
              mineralNames={mineralNames}
              initialTypeId={refineModal.typeId}
              basis={refineBasis}
              onBasisChange={(next) => void setStoredBasis(next)}
              shared={{
                generatedAt: view.generatedAt,
                source: usingMine ? 'mine' : 'shared',
                unavailable:
                  mine.status === 'ready'
                    ? null
                    : mine.status === 'signedOut'
                      ? 'signedOut'
                      : mine.status === 'failed'
                        ? 'failed'
                        : 'loading',
                onToggleSource: () => {
                  setAskedForMine(true);
                  setSource(usingMine ? 'shared' : 'mine');
                },
              }}
            />
          )}
        </>
      )}
    </ShareShell>
  );
}
