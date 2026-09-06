import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type ProductionRunRecord } from '@/db';
import {
  markProductionRunDeleted,
  removeProductionOrderWatch,
  removeProductionSaleLink,
  scheduleSync,
} from '@/sync';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  IconButton,
  Modal,
  Panel,
  Spinner,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { SkillLevels } from '@/engine/industry/types';
import { loadWalletTransactions } from '@/features/character/wallet';
import { loadOrders } from '@/features/character/orders';
import { SourcingInput } from './MaterialsTable';
import { summarizeProductionRun, type ProductionRunSummary } from './productionRunSummary';
import { ProductionRunStatusChip } from './ProductionRunStatusChip';
import type { MarketOrder, WalletTransaction } from '@/esi/endpoints';
import { iskToneClass } from '@/features/character/format';
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

interface RunForm {
  quantity: string;
  materialCost: string;
  jobFee: string;
}

const EMPTY_FORM: RunForm = { quantity: '', materialCost: '', jobFee: '' };

function runForm(run: Pick<ProductionRunRecord, 'quantity' | 'materialCost' | 'jobFee'>): RunForm {
  return {
    quantity: String(run.quantity),
    materialCost: String(Math.round(run.materialCost)),
    jobFee: String(Math.round(run.jobFee)),
  };
}

/**
 * "Production Runs" panel (issue #525): manual build-to-sale profit tracking
 * appended below a Build Plan's Results panel. Self-contained — reads and
 * writes the three Production Log Dexie tables directly, like the sibling
 * `ActiveJobsPanel` reads its own ESI data rather than the route threading it
 * through. Owns its own `Panel` wrapper (same convention as
 * `ActiveJobsPanel`) so "Log Production" can live in the header actions.
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
  const [form, setForm] = useState<RunForm>(EMPTY_FORM);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<RunForm>(EMPTY_FORM);
  const [picker, setPicker] = useState<{ runId: string; kind: PickerKind } | null>(null);
  const [manualSaleRunId, setManualSaleRunId] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({ quantity: '', unitPrice: '' });
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

  const linkedTransactionIds = new Set(
    saleLinks.flatMap((l) => (l.transactionId !== undefined ? [l.transactionId] : []))
  );
  const watchedOrderIds = new Set(orderWatches.map((w) => w.orderId));

  const rows: ProductionRunSummary[] = runs.map((run) =>
    summarizeProductionRun(run, saleLinks, orderWatches, skills)
  );

  const editingRow = editingRunId ? rows.find((r) => r.run.id === editingRunId) : undefined;

  function openLogProduction() {
    setForm(defaults ? runForm(defaults) : EMPTY_FORM);
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

  function openEdit(run: ProductionRunRecord) {
    setEditForm(runForm(run));
    setEditingRunId(run.id);
  }

  async function saveEdit() {
    if (!editingRow) return;
    const quantity = unmaskNumber(editForm.quantity) ?? editingRow.run.quantity;
    const materialCost = unmaskNumber(editForm.materialCost) ?? editingRow.run.materialCost;
    const jobFee = unmaskNumber(editForm.jobFee) ?? editingRow.run.jobFee;
    await db.productionRuns.put({
      ...editingRow.run,
      quantity,
      materialCost,
      jobFee,
      totalCost: materialCost + jobFee,
      updatedAt: Date.now(),
    });
    scheduleSync(characterId);
    setEditingRunId(null);
  }

  async function deleteRun(runId: string) {
    await markProductionRunDeleted(characterId, runId);
    if (editingRunId === runId) setEditingRunId(null);
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

  function openManualSale(runId: string) {
    setManualForm({ quantity: '', unitPrice: '' });
    setManualSaleRunId(runId);
  }

  async function saveManualSale() {
    if (!manualSaleRunId) return;
    const quantity = unmaskNumber(manualForm.quantity);
    const unitPrice = unmaskNumber(manualForm.unitPrice);
    if (!quantity || unitPrice === undefined) return;
    const now = Date.now();
    await db.productionSaleLinks.add({
      id: `${characterId}:manual:${crypto.randomUUID()}`,
      characterId,
      runId: manualSaleRunId,
      quantity,
      unitPrice,
      linkedAt: now,
      updatedAt: now,
    });
    scheduleSync(characterId);
    setManualSaleRunId(null);
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

  const columns: DataTableColumn<ProductionRunSummary>[] = [
    {
      id: 'loggedAt',
      header: t('industry.productionRunColumnLogged'),
      primary: true,
      className: 'whitespace-nowrap',
      sortValue: (r) => r.run.loggedAt,
      render: (r) => new Date(r.run.loggedAt).toLocaleDateString(),
    },
    {
      id: 'quantity',
      header: t('industry.quantity'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.run.quantity,
      render: (r) => r.run.quantity.toLocaleString(),
    },
    {
      id: 'totalCost',
      header: t('industry.totalCost'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.run.totalCost,
      render: (r) => formatIsk(r.run.totalCost),
    },
    {
      id: 'realizedRevenue',
      header: t('industry.realizedRevenue'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.profit.grossRevenue,
      render: (r) => formatIsk(r.profit.grossRevenue),
    },
    {
      id: 'realizedProfit',
      header: t('industry.realizedProfit'),
      align: 'right',
      className: 'tabular-nums font-semibold',
      cellClassName: (r) => iskToneClass(r.profit.profit),
      sortValue: (r) => r.profit.profit,
      render: (r) => formatIsk(r.profit.profit),
    },
    {
      id: 'quantitySold',
      header: t('industry.productionRunColumnSold'),
      align: 'right',
      className: 'tabular-nums text-text-dim',
      sortValue: (r) => r.quantitySold,
      render: (r) => `${r.quantitySold.toLocaleString()} / ${r.run.quantity.toLocaleString()}`,
    },
    {
      id: 'status',
      header: t('industry.productionRunColumnStatus'),
      align: 'right',
      sortValue: (r) => r.status,
      render: (r) => <ProductionRunStatusChip status={r.status} />,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div
          className="flex items-center justify-end gap-1.5"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex">
            <Button
              size="sm"
              className="rounded-r-none"
              onClick={() => void openPicker(r.run.id, 'sale')}
            >
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
                <DropdownMenuItem onSelect={() => void openPicker(r.run.id, 'watch')}>
                  {t('industry.watchOpenOrder')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => openManualSale(r.run.id)}>
                  {t('industry.manualSale')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {r.orderWatches.some((w) => !w.closed) && (
            <IconButton
              size="sm"
              icon={<Icon.Refresh />}
              label={t('industry.refresh')}
              onClick={() => void refreshWatches(r.run.id)}
              disabled={refreshingRunId === r.run.id}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <Panel
      title={t('industry.productionRuns')}
      actions={
        <Button size="sm" onClick={openLogProduction} disabled={productTypeID === null}>
          <Icon.AddToPlan /> {t('industry.logProduction')}
        </Button>
      }
    >
      {runs.length === 0 ? (
        <EmptyState title={t('industry.productionRunsEmptyTitle')} className="py-4" />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.run.id}
          label={t('industry.productionRuns')}
          density="compact"
          onRowClick={(r) => openEdit(r.run)}
        />
      )}

      <Modal
        open={loggingOpen}
        onClose={() => setLoggingOpen(false)}
        title={t('industry.logProduction')}
      >
        <ProductionRunForm
          hint={t('industry.logProductionHint', { name: productName })}
          form={form}
          onChange={setForm}
          onSubmit={() => void saveProductionRun()}
          submitLabel={t('industry.saveProductionRun')}
        />
      </Modal>

      <Modal
        open={editingRow !== undefined}
        onClose={() => setEditingRunId(null)}
        title={t('industry.editProductionRun')}
      >
        {editingRow && (
          <div className="space-y-4">
            <ProductionRunForm
              form={editForm}
              onChange={setEditForm}
              onSubmit={() => void saveEdit()}
              submitLabel={t('industry.saveProductionRun')}
            />
            {(editingRow.saleLinks.length > 0 || editingRow.orderWatches.length > 0) && (
              <div className="space-y-1 border-t border-line pt-3">
                <p className="text-[0.6875rem] font-semibold tracking-widest text-text-dim uppercase">
                  {t('industry.linkedSales')}
                </p>
                <ul className="space-y-1">
                  {editingRow.saleLinks.map((link) => (
                    <li
                      key={link.id}
                      className="flex items-center justify-between gap-2 text-[0.6875rem]"
                    >
                      <span>
                        {t('industry.linkedSaleRow', {
                          quantity: link.quantity,
                          price: formatIsk(link.unitPrice),
                        })}
                        {link.transactionId === undefined && ` (${t('industry.manualSale')})`}
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
                  {editingRow.orderWatches.map((watch) => (
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
              </div>
            )}
            <Button
              variant="danger"
              onClick={() => void deleteRun(editingRow.run.id)}
              className="w-full justify-center"
            >
              <Icon.Close /> {t('industry.deleteProductionRun')}
            </Button>
          </div>
        )}
      </Modal>

      <Modal open={picker !== null} onClose={closePicker} title={t('industry.soldButton')}>
        {picker &&
          (pickerLoading ? (
            <div className="flex justify-center py-6">
              <Spinner size="sm" label={t('common.loading')} />
            </div>
          ) : picker.kind === 'sale' ? (
            <SalePicker
              candidates={(walletTransactions ?? []).filter(
                (txn) =>
                  !txn.is_buy &&
                  txn.type_id === productTypeID &&
                  !linkedTransactionIds.has(txn.transaction_id)
              )}
              onLink={(txn) => void linkPastSale(picker.runId, txn)}
            />
          ) : (
            <WatchPicker
              candidates={(openOrders ?? []).filter(
                (order) =>
                  order.is_buy_order !== true &&
                  order.type_id === productTypeID &&
                  !watchedOrderIds.has(order.order_id)
              )}
              onWatch={(order) => void watchOpenOrder(picker.runId, order)}
            />
          ))}
      </Modal>

      <Modal
        open={manualSaleRunId !== null}
        onClose={() => setManualSaleRunId(null)}
        title={t('industry.manualSale')}
      >
        <div className="space-y-4">
          <p className="text-[0.6875rem] text-text-dim">{t('industry.manualSaleHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-xs">
              {t('industry.quantity')}
              <SourcingInput
                value={unmaskNumber(manualForm.quantity)}
                label={t('industry.quantity')}
                inputMode="numeric"
                widthClassName="w-full"
                parse={(raw) => unmaskNumber(raw)}
                onCommit={(value) =>
                  setManualForm((f) => ({
                    ...f,
                    quantity: value === undefined ? '' : String(value),
                  }))
                }
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              {t('industry.unitPrice')}
              <SourcingInput
                value={unmaskNumber(manualForm.unitPrice)}
                label={t('industry.unitPrice')}
                inputMode="numeric"
                widthClassName="w-full"
                parse={(raw) => unmaskNumber(raw)}
                onCommit={(value) =>
                  setManualForm((f) => ({
                    ...f,
                    unitPrice: value === undefined ? '' : String(value),
                  }))
                }
              />
            </label>
          </div>
          <Button
            variant="primary"
            onClick={() => void saveManualSale()}
            className="w-full justify-center"
          >
            {t('industry.saveProductionRun')}
          </Button>
        </div>
      </Modal>
    </Panel>
  );
}

interface ProductionRunFormProps {
  hint?: string;
  form: RunForm;
  onChange: (form: RunForm) => void;
  onSubmit: () => void;
  submitLabel: string;
}

/** Shared body for the "Log Production" and edit-run modals: the three cost/quantity fields plus a live total. */
function ProductionRunForm({
  hint,
  form,
  onChange,
  onSubmit,
  submitLabel,
}: ProductionRunFormProps) {
  const { t } = useTranslation();
  const materialCost = unmaskNumber(form.materialCost) ?? 0;
  const jobFee = unmaskNumber(form.jobFee) ?? 0;

  return (
    <div className="space-y-4">
      {hint && <p className="text-[0.6875rem] text-text-dim">{hint}</p>}
      <div className="grid grid-cols-3 gap-3">
        <label className="flex flex-col gap-1 text-xs">
          {t('industry.quantity')}
          <SourcingInput
            value={unmaskNumber(form.quantity)}
            label={t('industry.quantity')}
            inputMode="numeric"
            widthClassName="w-full"
            parse={(raw) => unmaskNumber(raw)}
            onCommit={(value) =>
              onChange({ ...form, quantity: value === undefined ? '' : String(value) })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t('industry.materialCost')}
          <SourcingInput
            value={unmaskNumber(form.materialCost)}
            label={t('industry.materialCost')}
            inputMode="numeric"
            widthClassName="w-full"
            parse={(raw) => unmaskNumber(raw)}
            onCommit={(value) =>
              onChange({ ...form, materialCost: value === undefined ? '' : String(value) })
            }
          />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          {t('industry.jobFee')}
          <SourcingInput
            value={unmaskNumber(form.jobFee)}
            label={t('industry.jobFee')}
            inputMode="numeric"
            widthClassName="w-full"
            parse={(raw) => unmaskNumber(raw)}
            onCommit={(value) =>
              onChange({ ...form, jobFee: value === undefined ? '' : String(value) })
            }
          />
        </label>
      </div>
      <div className="flex items-center justify-between gap-2 rounded-xs border border-line px-2.5 py-1.5 text-[0.6875rem]">
        <span className="font-semibold tracking-widest text-text-dim uppercase">
          {t('industry.totalCost')}
        </span>
        <span className="font-medium tabular-nums text-accent">
          {formatIsk(materialCost + jobFee)}
        </span>
      </div>
      <Button variant="primary" onClick={onSubmit} className="w-full justify-center">
        {submitLabel}
      </Button>
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
