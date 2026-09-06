import { useState } from 'react';
import { db, type ProductionOrderWatchRecord, type ProductionSaleLinkRecord } from '@/db';
import { scheduleSync } from '@/sync';
import { loadWalletTransactions } from '@/features/character/wallet';
import { loadOrders } from '@/features/character/orders';
import type { MarketOrder, WalletTransaction } from '@/esi/endpoints';
import { unmaskNumber } from '@/lib/numberMask';

export type SaleLinkingPickerKind = 'sale' | 'watch';

interface PickerState {
  runId: string;
  /**
   * Carried on the picker itself, not a single hook-wide value: a Build
   * Plan's own `ProductionRunsPanel` has one product for every run, but
   * `ProductionLogPanel` shows every run across every plan in one table, so
   * the candidate filter needs each run's own product at the moment its
   * picker opens.
   */
  productTypeID: number;
  kind: SaleLinkingPickerKind;
}

export interface ManualSaleForm {
  quantity: string;
  unitPrice: string;
}

const EMPTY_MANUAL_FORM: ManualSaleForm = { quantity: '', unitPrice: '' };

interface ManualSaleState {
  runId: string;
  form: ManualSaleForm;
}

/**
 * The "Sold" split button's three linking mechanisms (issue #525) — Link
 * Past Sale, Watch Open Order, Manual/Private Sale — plus the manual
 * refresh a watched order needs to pick up its latest `volume_remain`.
 * Shared between `ProductionRunsPanel` (one Build Plan's own runs) and
 * `ProductionLogPanel` (every run, every plan) so the two never drift.
 */
export function useSaleLinking(
  characterId: number,
  saleLinks: readonly ProductionSaleLinkRecord[],
  orderWatches: readonly ProductionOrderWatchRecord[]
) {
  const [picker, setPicker] = useState<PickerState | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [walletTransactions, setWalletTransactions] = useState<WalletTransaction[] | null>(null);
  const [openOrders, setOpenOrders] = useState<MarketOrder[] | null>(null);
  const [manualSale, setManualSale] = useState<ManualSaleState | null>(null);
  const [refreshingRunId, setRefreshingRunId] = useState<string | null>(null);

  const linkedTransactionIds = new Set(
    saleLinks.flatMap((l) => (l.transactionId !== undefined ? [l.transactionId] : []))
  );
  const watchedOrderIds = new Set(orderWatches.map((w) => w.orderId));

  async function openPicker(runId: string, productTypeID: number, kind: SaleLinkingPickerKind) {
    setPicker({ runId, productTypeID, kind });
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

  function openManualSale(runId: string) {
    setManualSale({ runId, form: EMPTY_MANUAL_FORM });
  }

  function closeManualSale() {
    setManualSale(null);
  }

  function setManualSaleForm(updater: (form: ManualSaleForm) => ManualSaleForm) {
    setManualSale((state) => (state ? { ...state, form: updater(state.form) } : state));
  }

  async function saveManualSale() {
    if (!manualSale) return;
    const quantity = unmaskNumber(manualSale.form.quantity);
    const unitPrice = unmaskNumber(manualSale.form.unitPrice);
    if (!quantity || unitPrice === undefined) return;
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${characterId}:manual:${crypto.randomUUID()}`,
      characterId,
      runId: manualSale.runId,
      quantity,
      unitPrice,
      linkedAt: now,
      updatedAt: now,
    });
    scheduleSync(characterId);
    setManualSale(null);
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

  async function refreshWatches(runId: string) {
    const watchesForRun = orderWatches.filter((w) => w.runId === runId && !w.closed);
    if (watchesForRun.length === 0) return;
    setRefreshingRunId(runId);
    try {
      const result = await loadOrders(characterId);
      const liveOrders = result.cached?.data ?? [];
      const liveById = new Map(liveOrders.map((o) => [o.order_id, o]));
      const now = Date.now();
      await db.productionOrderWatches.bulkPut(
        watchesForRun.map((watch) => {
          const live = liveById.get(watch.orderId);
          return {
            ...watch,
            lastKnownVolumeRemain: live ? live.volume_remain : watch.lastKnownVolumeRemain,
            closed: !live,
            updatedAt: now,
          };
        })
      );
      scheduleSync(characterId);
    } finally {
      setRefreshingRunId(null);
    }
  }

  const saleCandidates =
    picker?.kind === 'sale'
      ? (walletTransactions ?? []).filter(
          (txn) =>
            !txn.is_buy &&
            txn.type_id === picker.productTypeID &&
            !linkedTransactionIds.has(txn.transaction_id)
        )
      : [];
  const watchCandidates =
    picker?.kind === 'watch'
      ? (openOrders ?? []).filter(
          (order) =>
            order.is_buy_order !== true &&
            order.type_id === picker.productTypeID &&
            !watchedOrderIds.has(order.order_id)
        )
      : [];

  return {
    picker,
    pickerLoading,
    saleCandidates,
    watchCandidates,
    manualSale,
    setManualSaleForm,
    refreshingRunId,
    openPicker,
    closePicker,
    openManualSale,
    closeManualSale,
    saveManualSale,
    linkPastSale,
    watchOpenOrder,
    refreshWatches,
  };
}

export type SaleLinking = ReturnType<typeof useSaleLinking>;
