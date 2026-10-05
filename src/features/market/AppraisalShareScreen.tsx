import { useMemo, type ReactNode } from 'react';
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
import type { AppraisalRow } from '@/engine/market/appraisal';
import { ShareShell, type OpenInApp } from '@/features/share/ShareShell';
import { formatIskAuto } from '@/lib/isk';
import { appraisalCsvColumns } from './appraisalCsv';
import type { AppraisalShareView } from './appraisalShareData';
import { appraisalVolumeColumn } from './appraisalVolume';
import { AppraisalVolumeChip } from './AppraisalVolumeChip';
import { formatVolume } from './format';
import { FullIskTotal } from './FullIskTotal';

const NO_ROWS: readonly AppraisalRow[] = [];

/**
 * A per-unit price, exact — same split as `AppraisalPanel`, so a share link
 * reads like the tab it was shared from. Stays on `formatIskAuto`: an
 * each-price runs from a 5 ISK mineral to a billion-ISK hull, and shorthand
 * rounds the cheap end into nonsense. A missing price is a dash, never a zero.
 */
function eachCell(value: number | null): string {
  if (value === null) return '—';
  return formatIskAuto(value);
}

/** A line total as scannable shorthand, exact value one gesture away. */
function totalCell(value: number | null): ReactNode {
  if (value === null) return '—';
  return <IskAmount value={value} decimals={0} />;
}

export type AppraisalShareState =
  { status: 'invalid' } | { status: 'ready'; view: AppraisalShareView };

interface AppraisalShareScreenProps {
  state: AppraisalShareState;
  /** Epoch millis the Share Link dies at — shown, since the recipient never saw the sender's "works for 7 days". */
  expiresAt: number;
  openInApp?: OpenInApp;
}

/**
 * The **Shared Appraisal** a Share Link opens (`routes/SharedLink.tsx`), at
 * the prices it was shared with. Read-only: no paste box, no hub or percent
 * controls — "Open Neocom Desk" carries the same pile into the live tab for
 * that. Never a redirect, even for a signed-in visitor: the live tab
 * re-prices, and the sender's figures would be gone before anyone read them.
 */
export function AppraisalShareScreen({ state, expiresAt, openInApp }: AppraisalShareScreenProps) {
  const { t } = useTranslation();
  const shareRows = state.status === 'ready' ? state.view.appraisal.rows : NO_ROWS;
  const csvColumns = useMemo(() => appraisalCsvColumns(t), [t]);
  const tableExport = useTableExport({
    surface: 'appraisal-shared',
    rows: shareRows,
    columns: csvColumns,
  });

  const columns: DataTableColumn<AppraisalRow>[] = [
    {
      id: 'quantity',
      header: t('market.appraisal.columnQuantity'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => formatVolume(row.quantity),
      sortValue: (row) => row.quantity,
    },
    {
      id: 'item',
      header: t('market.appraisal.columnItem'),
      primary: true,
      render: (row) => row.name,
      sortValue: (row) => row.name,
    },
    {
      id: 'buyEach',
      header: t('market.appraisal.columnBuyEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.buyEach),
      sortValue: (row) => row.buyEach ?? undefined,
    },
    {
      id: 'sellEach',
      header: t('market.appraisal.columnSellEach'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums text-text-dim',
      render: (row) => eachCell(row.sellEach),
      sortValue: (row) => row.sellEach ?? undefined,
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
    appraisalVolumeColumn(t),
  ];

  return (
    <ShareShell
      title={t('appraisalShare.title')}
      openInApp={openInApp}
      actions={
        shareRows.length > 0 ? (
          <TableActionsMenu name={t('appraisalShare.title')} tableExport={tableExport} />
        ) : undefined
      }
    >
      {state.status === 'invalid' && (
        <EmptyState
          title={t('appraisalShare.invalidTitle')}
          hint={t('appraisalShare.invalidHint')}
          className="py-10"
        />
      )}

      {state.status === 'ready' && (
        <>
          <StatChips className="border-b border-line px-1 py-2">
            <StatChip
              label={state.view.hub.systemName}
              value={t('market.appraisal.atPercent', { pricePercent: state.view.pricePercent })}
            />
            <StatChip
              label={t('market.appraisal.sellTotal')}
              value={<FullIskTotal value={state.view.appraisal.totals.sell} />}
              tone="accent"
            />
            <StatChip
              label={t('market.appraisal.buyTotal')}
              value={<FullIskTotal value={state.view.appraisal.totals.buy} />}
            />
            <AppraisalVolumeChip totals={state.view.appraisal.totals} />
            <StatChip
              label={t('appraisalShare.generatedLabel')}
              value={new Date(state.view.generatedAt * 1000).toLocaleString()}
            />
            <StatChip
              label={t('appraisalShare.expiresLabel')}
              value={new Date(expiresAt).toLocaleString()}
            />
          </StatChips>

          {state.view.appraisal.rows.length === 0 ? (
            <EmptyState
              title={t('market.appraisal.noMatchesTitle')}
              hint={t('market.appraisal.noMatchesHint')}
              className="py-10"
            />
          ) : (
            <DataTable
              {...tableExport.tableProps}
              columns={columns}
              rows={state.view.appraisal.rows}
              rowKey={(row) => row.typeId}
              label={t('appraisalShare.title')}
              // Six short numeric columns hang off the item name here, so the
              // default one-per-line stack turned every item into a card one
              // line per column — on the one page most likely to be opened from a phone
              // chat client (#1113, the follow-up #1097 scoped out).
              stackColumns={2}
            />
          )}
        </>
      )}
    </ShareShell>
  );
}
