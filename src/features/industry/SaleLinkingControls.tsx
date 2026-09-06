import { useTranslation } from 'react-i18next';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Modal,
  Spinner,
} from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { MarketOrder, WalletTransaction } from '@/esi/endpoints';
import type { SaleLinking } from './useSaleLinking';
import { SourcingInput } from './MaterialsTable';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';

/**
 * The "Sold" split button — primary action Link Past Sale, plus an attached
 * chevron revealing Watch Open Order and Manual/Private Sale — shared by
 * `ProductionRunsPanel` and `ProductionLogPanel`'s action columns. An
 * optional refresh icon sits beside it for a run with an open watch; only
 * `ProductionRunsPanel`'s per-plan table passes one today, but it takes no
 * plan context, so `ProductionLogPanel` gets it for free by passing the
 * props through.
 */
export function SoldSplitButton({
  onSold,
  onWatch,
  onManual,
  onRefresh,
  refreshing = false,
}: {
  onSold: () => void;
  onWatch: () => void;
  onManual: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center justify-end gap-1.5"
      onClick={(event) => event.stopPropagation()}
    >
      <div className="flex">
        <Button size="sm" className="rounded-r-none" onClick={onSold}>
          {t('industry.soldButton')}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton
              size="sm"
              icon={<Icon.Expanded />}
              label={t('industry.moreSaleOptions')}
              className="-ml-px rounded-l-none border-l-0"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onWatch}>{t('industry.watchOpenOrder')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={onManual}>{t('industry.manualSale')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {onRefresh && (
        <IconButton
          size="sm"
          icon={<Icon.Refresh />}
          label={t('industry.refresh')}
          onClick={onRefresh}
          disabled={refreshing}
        />
      )}
    </div>
  );
}

function SalePicker({
  candidates,
  onLink,
}: {
  candidates: WalletTransaction[];
  onLink: (txn: WalletTransaction) => void;
}) {
  const { t } = useTranslation();
  if (candidates.length === 0) {
    return <EmptyState title={t('industry.noPastSalesToLink')} className="py-4" />;
  }
  return (
    <ul className="space-y-1">
      {candidates.map((txn) => (
        <li
          key={txn.transaction_id}
          className="flex items-center justify-between gap-2 rounded-xs border border-line px-2.5 py-1.5 text-[0.6875rem]"
        >
          <span>
            {t('industry.linkedSaleRow', {
              quantity: txn.quantity,
              price: formatIsk(txn.unit_price),
            })}
            {' — '}
            {formatIsk(txn.quantity * txn.unit_price)}
            {' — '}
            {new Date(txn.date).toLocaleDateString()}
          </span>
          <Button size="sm" onClick={() => onLink(txn)}>
            {t('industry.link')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

function WatchPicker({
  candidates,
  onWatch,
}: {
  candidates: MarketOrder[];
  onWatch: (order: MarketOrder) => void;
}) {
  const { t } = useTranslation();
  if (candidates.length === 0) {
    return <EmptyState title={t('industry.noOpenOrdersToWatch')} className="py-4" />;
  }
  return (
    <ul className="space-y-1">
      {candidates.map((order) => (
        <li
          key={order.order_id}
          className="flex items-center justify-between gap-2 rounded-xs border border-line px-2.5 py-1.5 text-[0.6875rem]"
        >
          <span>
            {t('industry.watchedOrderRow', {
              filled: 0,
              total: order.volume_remain,
              price: formatIsk(order.price),
              status: t('industry.watchedOrderOpen'),
            })}
          </span>
          <Button size="sm" onClick={() => onWatch(order)}>
            {t('industry.watch')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The two dialogs `useSaleLinking`'s state drives: the Link Past Sale/Watch
 * Open Order picker, and the Manual/Private Sale form. One instance per
 * panel that uses the hook — mount it once alongside the table, not once
 * per row.
 */
export function SaleLinkingModals({ sale }: { sale: SaleLinking }) {
  const { t } = useTranslation();
  return (
    <>
      <Modal
        open={sale.picker !== null}
        onClose={sale.closePicker}
        title={t('industry.soldButton')}
      >
        {sale.picker &&
          (sale.pickerLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" label={t('common.loading')} />
            </div>
          ) : sale.picker.kind === 'sale' ? (
            <SalePicker
              candidates={sale.saleCandidates}
              onLink={(txn) => void sale.linkPastSale(sale.picker!.runId, txn)}
            />
          ) : (
            <WatchPicker
              candidates={sale.watchCandidates}
              onWatch={(order) => void sale.watchOpenOrder(sale.picker!.runId, order)}
            />
          ))}
      </Modal>

      <Modal
        open={sale.manualSale !== null}
        onClose={sale.closeManualSale}
        title={t('industry.manualSale')}
      >
        <div className="space-y-4">
          <p className="text-[0.6875rem] text-text-dim">{t('industry.manualSaleHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              {t('industry.quantity')}
              <SourcingInput
                value={unmaskNumber(sale.manualSale?.form.quantity ?? '')}
                label={t('industry.quantity')}
                inputMode="numeric"
                widthClassName="w-full"
                parse={(raw) => unmaskNumber(raw)}
                onCommit={(value) =>
                  sale.setManualSaleForm((f) => ({
                    ...f,
                    quantity: value === undefined ? '' : String(value),
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('industry.unitPrice')}
              <SourcingInput
                value={unmaskNumber(sale.manualSale?.form.unitPrice ?? '')}
                label={t('industry.unitPrice')}
                inputMode="numeric"
                widthClassName="w-full"
                parse={(raw) => unmaskNumber(raw)}
                onCommit={(value) =>
                  sale.setManualSaleForm((f) => ({
                    ...f,
                    unitPrice: value === undefined ? '' : String(value),
                  }))
                }
              />
            </label>
          </div>
          <Button
            variant="primary"
            onClick={() => void sale.saveManualSale()}
            className="w-full justify-center"
          >
            {t('industry.saveProductionRun')}
          </Button>
        </div>
      </Modal>
    </>
  );
}
