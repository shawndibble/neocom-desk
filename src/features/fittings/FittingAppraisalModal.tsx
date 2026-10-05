import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Button,
  DataTable,
  entityLinkClassName,
  Modal,
  type DataTableColumn,
} from '@/components/ui';
import type { Appraisal, AppraisalRow } from '@/engine/market/appraisal';
import { multibuyText } from '@/engine/market/haulingPlan';
import { useMarketHub } from '@/features/market/hub';
import { MarketItemLink } from '@/features/market/MarketItemLink';
import { writeToClipboard } from '@/lib/clipboard';
import { formatIsk } from '@/lib/isk';
import { TRADE_HUBS } from '@/market/hubs';
import { useTimedToast, NOTICE_MS } from '@/components/ui/useTimedToast';

interface Props {
  open: boolean;
  onClose: () => void;
  price: Appraisal;
}

/**
 * The Price section's per-item breakdown: what each item in the Fitting costs
 * off the hub's sell orders — the same rows and total the section's Sell
 * figure sums — with the list ready to paste into the game's Multibuy.
 */
export function FittingAppraisalModal({ open, onClose, price }: Props) {
  const { t } = useTranslation();
  const hubId = useMarketHub((state) => state.value);
  const hub = TRADE_HUBS.find((tradeHub) => tradeHub.id === hubId);
  const [notice, setNotice] = useState<string | null>(null);

  useTimedToast(notice, () => setNotice(null), NOTICE_MS);

  const isk = (value: number | null) =>
    value === null ? '—' : t('fittings.stats.unit.isk', { value: formatIsk(value, 2) });

  const columns: DataTableColumn<AppraisalRow>[] = [
    {
      id: 'name',
      header: t('fittings.appraisal.item'),
      render: (row) => (
        <MarketItemLink typeId={row.typeId} className={entityLinkClassName()}>
          {row.name}
        </MarketItemLink>
      ),
    },
    {
      id: 'quantity',
      header: t('fittings.appraisal.quantity'),
      align: 'right',
      className: 'tabular-nums',
      render: (row) => row.quantity.toLocaleString(),
    },
    {
      id: 'unit',
      header: t('fittings.appraisal.unitPrice'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => isk(row.sellEach),
    },
    {
      id: 'total',
      header: t('fittings.appraisal.lineTotal'),
      align: 'right',
      className: 'whitespace-nowrap tabular-nums',
      render: (row) => isk(row.sellTotal),
    },
  ];

  async function copyMultibuy() {
    try {
      await writeToClipboard(multibuyText(price.rows));
      setNotice(t('fittings.export.copied.multibuy'));
    } catch {
      setNotice(t('fittings.export.copyFailed'));
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('fittings.appraisal.title')}>
      <div className="space-y-3">
        {hub && (
          <p className="text-xs text-text-dim">
            {t('fittings.appraisal.basis', { hub: hub.systemName })}
          </p>
        )}
        <DataTable
          columns={columns}
          rows={price.rows}
          rowKey={(row) => row.typeId}
          label={t('fittings.appraisal.tableLabel')}
          density="compact"
        />
        <div className="flex justify-between gap-2 border-t border-line pt-2 text-sm font-semibold">
          <span>{t('fittings.appraisal.total')}</span>
          <span className="tabular-nums">{isk(price.totals.sell)}</span>
        </div>
        {price.totals.unpricedRows > 0 && (
          <p className="text-xs text-warning">
            {t('fittings.stats.priceUnpriced', { count: price.totals.unpricedRows })}
          </p>
        )}
        <div className="flex items-center justify-end gap-2">
          {/* Always mounted, so a screen reader announces the notice when it appears. */}
          <span role="status" className="text-xs text-text-dim">
            {notice}
          </span>
          <Button variant="primary" onClick={() => void copyMultibuy()}>
            {t('fittings.appraisal.copyMultibuy')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
