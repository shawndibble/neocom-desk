import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db';
import {
  markProductionRunDeleted,
  removeProductionOrderWatch,
  removeProductionSaleLink,
  scheduleSync,
} from '@/sync';
import { Button, EmptyState, IconButton, Modal, Spinner, TextInput } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import { realizedProfit } from '@/engine/industry/realizedProfit';
import { computeOrderFillQuantity } from '@/engine/industry/orderWatch';
import { SKILL_IDS, type SkillLevels } from '@/engine/industry/types';
import { loadWalletTransactions } from '@/features/character/wallet';
import { loadOrders } from '@/features/character/orders';
import type { MarketOrder, WalletTransaction } from '@/esi/endpoints';
import { formatIsk } from '@/lib/isk';
import { unmaskNumber } from '@/lib/numberMask';

interface ProductionRunsPanelProps {
  characterId: number;
  buildPlanId: string;
  /** Prefills the "Log Production" form; null when the plan's own result hasn't computed yet. */
  defaults: { quantity: number; materialCost: number; jobFee: number } | null;
  productTypeID: number | null;
  productName: string;
  skills: SkillLevels;
}

type PickerKind = 'sale' | 'watch';

function txnLineTotal(t: WalletTransaction): number {
  return t.quantity * t.unit_price;
}

/**
 * "Production Runs" panel (issue #525): manual build-to-sale profit tracking
 * appended below a Build Plan's Results panel. Self-contained — reads and
 * writes the three Production Log Dexie tables directly, like the sibling
 * `ActiveJobsPanel` reads its own ESI data rather than the route threading it
 * through.
 */
export function ProductionRunsPanel({
  characterId,
  buildPlanId,
  defaults,
  productTypeID,
  productName,
  skills,
}: ProductionRunsPanelProps) {
  const { t } = useTranslation();
  const [loggingOpen, setLoggingOpen] = useState(false);
  const [form, setForm] = useState({ quantity: '', materialCost: '', jobFee: '' });
  const [picker, setPicker] = useState<{ runId: string; kind: PickerKind } | null>(null);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[] | null>(null);
  const [openOrders, setOpenOrders] = useState<MarketOrder[] | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [refreshingRunId, setRefreshingRunId] = useState<string | null>(null);

  const runs =
    useLiveQuery(
      () => db.productionRuns.where('buildPlanId').equals(buildPlanId).toArray(),
      [buildPlanId]
    ) ?? [];
  const saleLinks =
    useLiveQuery(
      () => db.productionSaleLinks.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? [];
  const orderWatches =
    useLiveQuery(
      () => db.productionOrderWatches.where('characterId').equals(characterId).toArray(),
      [characterId]
    ) ?? [];

  const linkedTransactionIds = new Set(saleLinks.map((l) => l.transactionId));
  const watchedOrderIds = new Set(orderWatches.map((w) => w.orderId));

  function openLogProduction() {
    setForm({
      quantity: defaults ? String(defaults.quantity) : '',
      materialCost: defaults ? String(Math.round(defaults.materialCost)) : '',
      jobFee: defaults ? String(Math.round(defaults.jobFee)) : '',
    });
    setLoggingOpen(true);
  }

  async function saveProductionRun() {
    if (productTypeID === null) return;
    const quantity = unmaskNumber(form.quantity) ?? 0;
    const materialCost = unmaskNumber(form.materialCost) ?? 0;
    const jobFee = unmaskNumber(form.jobFee) ?? 0;
    const now = Date.now();
    await db.productionRuns.add({
      id: crypto.randomUUID(),
      characterId,
      buildPlanId,
      productTypeID,
      quantity,
      materialCost,
      jobFee,
      totalCost: materialCost + jobFee,
      loggedAt: now,
      updatedAt: now,
    });
    scheduleSync(characterId);
    setLoggingOpen(false);
  }

  async function deleteRun(runId: string) {
    await markProductionRunDeleted(characterId, runId);
  }

  async function openPicker(runId: string, kind: PickerKind) {
    setPicker({ runId, kind });
    setPickerLoading(true);
    try {
      if (kind === 'sale') {
        const cached = await loadWalletTransactions(characterId);
        setWalletTransactions(cached?.data ?? []);
      } else {
        const result = await loadOrders(characterId);
        setOpenOrders(result.cached?.data ?? []);
      }
    } finally {
      setPickerLoading(false);
    }
  }

  function closePicker() {
    setPicker(null);
  }

  async function linkPastSale(runId: string, txn: WalletTransaction) {
    const now = Date.now();
    try {
      await db.productionSaleLinks.add({
        id: `${characterId}:txn:${txn.transaction_id}`,
        characterId,
        runId,
        transactionId: txn.transaction_id,
        quantity: txn.quantity,
        unitPrice: txn.unit_price,
        linkedAt: now,
        updatedAt: now,
      });
      scheduleSync(characterId);
    } catch {
      // Already linked (Dexie's primary-key constraint on the deterministic
      // id) — the picker list should already exclude it, but a concurrent
      // link from another device can win the race between load and click.
    }
    closePicker();
  }

  async function watchOpenOrder(runId: string, order: MarketOrder) {
    const now = Date.now();
    try {
      await db.productionOrderWatches.add({
        id: `${characterId}:order:${order.order_id}`,
        characterId,
        runId,
        orderId: order.order_id,
        unitPrice: order.price,
        initialVolumeRemain: order.volume_remain,
        lastKnownVolumeRemain: order.volume_remain,
        closed: false,
        watchedAt: now,
        updatedAt: now,
      });
      scheduleSync(characterId);
    } catch {
      // Already watched — see linkPastSale's catch.
    }
    closePicker();
  }

  async function unlinkSale(linkId: string) {
    await removeProductionSaleLink(characterId, linkId);
  }

  async function unwatchOrder(watchId: string) {
    await removeProductionOrderWatch(characterId, watchId);
  }

  async function refreshWatches(runId: string) {
    const watchesForRun = orderWatches.filter((w) => w.runId === runId && !w.closed);
    if (watchesForRun.length === 0) return;
    setRefreshingRunId(runId);
    try {
      const result = await loadOrders(characterId);
      const liveOrders = result.cached?.data ?? [];
      const liveById = new Map(liveOrders.map((o) => [o.order_id, o]));
      const now = Date.now();
      for (const watch of watchesForRun) {
        const live = liveById.get(watch.orderId);
        await db.productionOrderWatches.put({
          ...watch,
          lastKnownVolumeRemain: live ? live.volume_remain : watch.lastKnownVolumeRemain,
          closed: !live,
          updatedAt: now,
        });
      }
      scheduleSync(characterId);
    } finally {
      setRefreshingRunId(null);
    }
  }

  if (runs.length === 0) {
    return (
      <div className="space-y-3">
        <EmptyState title={t('industry.productionRunsEmptyTitle')} className="py-4" />
        <Button size="sm" onClick={openLogProduction} disabled={productTypeID === null}>
          <Icon.AddToPlan /> {t('industry.logProduction')}
        </Button>
        {renderModal()}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={openLogProduction} disabled={productTypeID === null}>
        <Icon.AddToPlan /> {t('industry.logProduction')}
      </Button>

      <div className="space-y-3">
        {runs.map((run) => {
          const runSaleLinks = saleLinks.filter((l) => l.runId === run.id);
          const runOrderWatches = orderWatches
            .filter((w) => w.runId === run.id)
            .map((w) => ({
              ...w,
              filled: computeOrderFillQuantity(w.initialVolumeRemain, w.lastKnownVolumeRemain),
            }));
          const linkedRevenue = runSaleLinks.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
          const linkedQty = runSaleLinks.reduce((sum, l) => sum + l.quantity, 0);
          const watchFilledQty = runOrderWatches.reduce((sum, w) => sum + w.filled, 0);
          const watchRevenue = runOrderWatches.reduce((sum, w) => sum + w.filled * w.unitPrice, 0);
          const profit = realizedProfit({
            materialCost: run.materialCost,
            jobFee: run.jobFee,
            quantitySold: linkedQty + watchFilledQty,
            grossRevenue: linkedRevenue + watchRevenue,
            accountingLevel: skills[SKILL_IDS.accounting] ?? 0,
            brokerFeeableRevenue: watchRevenue,
            brokerRelationsLevel: skills[SKILL_IDS.brokerRelations] ?? 0,
          });

          return (
            <div key={run.id} className="space-y-2 rounded-xs border border-line p-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="text-[0.6875rem] text-text-dim">
                  {t('industry.productionRunLoggedAt', {
                    date: new Date(run.loggedAt).toLocaleDateString(),
                    quantity: run.quantity,
                  })}
                </div>
                <IconButton
                  size="sm"
                  variant="plain"
                  tone="danger"
                  icon={<Icon.Close />}
                  label={t('industry.deleteProductionRun')}
                  onClick={() => void deleteRun(run.id)}
                />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[0.6875rem]">
                <span className="text-text-dim uppercase tracking-widest">
                  {t('industry.totalCost')}
                </span>
                <span className="text-right tabular-nums">{formatIsk(run.totalCost)}</span>
                <span className="text-text-dim uppercase tracking-widest">
                  {t('industry.realizedRevenue')}
                </span>
                <span className="text-right tabular-nums">{formatIsk(profit.grossRevenue)}</span>
                <span className="text-text-dim uppercase tracking-widest">
                  {t('industry.realizedProfit')}
                </span>
                <span
                  className={`text-right font-semibold tabular-nums ${profit.profit >= 0 ? 'text-isk-pos' : 'text-isk-neg'}`}
                >
                  {formatIsk(profit.profit)}
                </span>
                <span className="text-text-dim uppercase tracking-widest">
                  {t('industry.quantitySold')}
                </span>
                <span className="text-right tabular-nums">
                  {linkedQty + watchFilledQty} / {run.quantity}
                </span>
              </div>

              {runSaleLinks.length > 0 || runOrderWatches.length > 0 ? (
                <ul className="space-y-1">
                  {runSaleLinks.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 text-[0.6875rem]"
                    >
                      <span>
                        {t('industry.linkedSaleRow', {
                          quantity: link.quantity,
                          price: formatIsk(link.unitPrice),
                        })}
                      </span>
                      <IconButton
                        size="sm"
                        variant="plain"
                        icon={<Icon.Close />}
                        label={t('industry.unlinkSale')}
                        onClick={() => void unlinkSale(link.id)}
                      />
                    </li>
                  ))}
                  {runOrderWatches.map((watch) => (
                    <li
                      key={watch.id}
                      className="flex items-center justify-between gap-2 text-[0.6875rem]"
                    >
                      <span>
                        {t('industry.watchedOrderRow', {
                          filled: watch.filled,
                          total: watch.initialVolumeRemain,
                          price: formatIsk(watch.unitPrice),
                          status: watch.closed
                            ? t('industry.watchedOrderClosed')
                            : t('industry.watchedOrderOpen'),
                        })}
                      </span>
                      <IconButton
                        size="sm"
                        variant="plain"
                        icon={<Icon.Close />}
                        label={t('industry.unwatchOrder')}
                        onClick={() => void unwatchOrder(watch.id)}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" onClick={() => void openPicker(run.id, 'sale')}>
                  {t('industry.linkPastSale')}
                </Button>
                <Button size="sm" onClick={() => void openPicker(run.id, 'watch')}>
                  {t('industry.watchOpenOrder')}
                </Button>
                {runOrderWatches.some((w) => !w.closed) && (
                  <IconButton
                    size="sm"
                    icon={<Icon.Refresh />}
                    label={t('industry.refresh')}
                    onClick={() => void refreshWatches(run.id)}
                    disabled={refreshingRunId === run.id}
                  />
                )}
              </div>

              {picker?.runId === run.id && (
                <div className="space-y-1 rounded-xs border border-line bg-panel-2 p-2">
                  {pickerLoading ? (
                    <div className="flex justify-center py-2">
                      <Spinner size="sm" label={t('common.loading')} />
                    </div>
                  ) : picker.kind === 'sale' ? (
                    renderSalePicker(run.id)
                  ) : (
                    renderWatchPicker(run.id)
                  )}
                  <Button size="sm" onClick={closePicker}>
                    {t('common.close')}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {renderModal()}
    </div>
  );

  function renderSalePicker(runId: string) {
    const candidates = (walletTransactions ?? []).filter(
      (txn) =>
        !txn.is_buy &&
        txn.type_id === productTypeID &&
        !linkedTransactionIds.has(txn.transaction_id)
    );
    if (candidates.length === 0) {
      return <p className="text-[0.6875rem] text-text-dim">{t('industry.noPastSalesToLink')}</p>;
    }
    return (
      <ul className="space-y-1">
        {candidates.map((txn) => (
          <li
            key={txn.transaction_id}
            className="flex items-center justify-between gap-2 text-[0.6875rem]"
          >
            <span>
              {t('industry.linkedSaleRow', {
                quantity: txn.quantity,
                price: formatIsk(txn.unit_price),
              })}{' '}
              — {formatIsk(txnLineTotal(txn))} — {new Date(txn.date).toLocaleDateString()}
            </span>
            <Button size="sm" onClick={() => void linkPastSale(runId, txn)}>
              {t('industry.link')}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  function renderWatchPicker(runId: string) {
    const candidates = (openOrders ?? []).filter(
      (order) =>
        order.is_buy_order !== true &&
        order.type_id === productTypeID &&
        !watchedOrderIds.has(order.order_id)
    );
    if (candidates.length === 0) {
      return <p className="text-[0.6875rem] text-text-dim">{t('industry.noOpenOrdersToWatch')}</p>;
    }
    return (
      <ul className="space-y-1">
        {candidates.map((order) => (
          <li
            key={order.order_id}
            className="flex items-center justify-between gap-2 text-[0.6875rem]"
          >
            <span>
              {t('industry.watchedOrderRow', {
                filled: 0,
                total: order.volume_remain,
                price: formatIsk(order.price),
                status: t('industry.watchedOrderOpen'),
              })}
            </span>
            <Button size="sm" onClick={() => void watchOpenOrder(runId, order)}>
              {t('industry.watch')}
            </Button>
          </li>
        ))}
      </ul>
    );
  }

  function renderModal() {
    return (
      <Modal
        open={loggingOpen}
        onClose={() => setLoggingOpen(false)}
        title={t('industry.logProduction')}
      >
        <div className="space-y-3">
          <p className="text-[0.6875rem] text-text-dim">
            {t('industry.logProductionHint', { name: productName })}
          </p>
          <label className="block space-y-1">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.quantity')}
            </span>
            <TextInput
              value={form.quantity}
              onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
              inputMode="numeric"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.materialCost')}
            </span>
            <TextInput
              value={form.materialCost}
              onChange={(e) => setForm((f) => ({ ...f, materialCost: e.target.value }))}
              inputMode="numeric"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
              {t('industry.jobFee')}
            </span>
            <TextInput
              value={form.jobFee}
              onChange={(e) => setForm((f) => ({ ...f, jobFee: e.target.value }))}
              inputMode="numeric"
            />
          </label>
          <Button variant="primary" onClick={() => void saveProductionRun()}>
            {t('industry.saveProductionRun')}
          </Button>
        </div>
      </Modal>
    );
  }
}
