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
  CollapsiblePanel,
  DataTable,
  EmptyState,
  IconButton,
  Modal,
} from '@/components/ui';
import type { DataTableColumn } from '@/components/ui';
import * as Icon from '@/components/ui/icons';
import type { SkillLevels } from '@/engine/industry/types';
import { SourcingInput } from './MaterialsTable';
import {
  rollupProductionRuns,
  summarizeProductionRun,
  type ProductionRunSummary,
} from './productionRunSummary';
import {
  loggedAtColumn,
  quantityColumn,
  quantitySoldColumn,
  realizedProfitColumn,
  soldActionsColumn,
  statusColumn,
  totalCostColumn,
} from './productionRunColumns';
import { SaleLinkingModals } from './SaleLinkingControls';
import { useSaleLinking } from './useSaleLinking';
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
  /**
   * Bumped by the parent each time something outside this panel asks to log
   * a run — the hero's own "Log Production" button. A counter rather than a
   * boolean so two requests in a row both open the form, and so the panel
   * never has to tell the parent to reset anything.
   */
  logRequest?: number;
}

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
  logRequest = 0,
}: ProductionRunsPanelProps) {
  const { t } = useTranslation();
  const [loggingOpen, setLoggingOpen] = useState(false);
  // Closed until asked: the table is the record, and on a plan being priced
  // the header's one-line rollup is the read that matters. Its rows are
  // still one click away, whatever the viewport.
  const [expanded, setExpanded] = useState(false);
  const [editingRunId, setEditingRunId] = useState<string | null>(null);
  /**
   * The last outside request this panel has answered. The form is open while
   * a newer one is outstanding — derived, so an outside request needs no
   * effect and no render-time state adjustment — and closing it settles the
   * counter. The form's `key` below is what makes each open start fresh.
   */
  const [dismissedLogRequest, setDismissedLogRequest] = useState(logRequest);
  const requestedOpen = logRequest > dismissedLogRequest && productTypeID !== null;
  const loggingModalOpen = loggingOpen || requestedOpen;

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

  const sale = useSaleLinking(characterId, saleLinks, orderWatches);

  const rows: ProductionRunSummary[] = runs.map((run) =>
    summarizeProductionRun(run, saleLinks, orderWatches, skills)
  );

  const editingRow = editingRunId ? rows.find((r) => r.run.id === editingRunId) : undefined;

  function openLogProduction() {
    setLoggingOpen(true);
  }

  function closeLogProduction() {
    setLoggingOpen(false);
    setDismissedLogRequest(logRequest);
  }

  const rollup = rollupProductionRuns(rows);
  const runsSummary = t('industry.runsSummary', {
    count: rollup.count,
    profit: formatIsk(rollup.realizedProfit),
    open: rollup.openCount,
  });

  async function saveProductionRun(form: RunForm) {
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
    closeLogProduction();
  }

  function openEdit(run: ProductionRunRecord) {
    setEditingRunId(run.id);
  }

  async function saveEdit(editForm: RunForm) {
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

  async function unlinkSale(linkId: string) {
    await removeProductionSaleLink(characterId, linkId);
  }

  async function unwatchOrder(watchId: string) {
    await removeProductionOrderWatch(characterId, watchId);
  }

  const columns: DataTableColumn<ProductionRunSummary>[] = [
    loggedAtColumn(t),
    quantityColumn(t),
    totalCostColumn(t),
    {
      id: 'realizedRevenue',
      header: t('industry.realizedRevenue'),
      align: 'right',
      className: 'tabular-nums',
      sortValue: (r) => r.profit.grossRevenue,
      render: (r) => formatIsk(r.profit.grossRevenue),
    },
    realizedProfitColumn(t),
    quantitySoldColumn(t),
    statusColumn(t),
    soldActionsColumn(sale),
  ];

  return (
    <>
      <CollapsiblePanel
        title={t('industry.productionRuns')}
        meta={
          rollup.count > 0 && (
            <span className="text-xs tabular-nums text-text-dim">{runsSummary}</span>
          )
        }
        expanded={expanded}
        collapsible={runs.length > 0}
        onToggle={() => setExpanded((open) => !open)}
        labels={{ show: t('industry.runsShow'), hide: t('industry.runsHide') }}
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
      </CollapsiblePanel>

      <Modal
        open={loggingModalOpen}
        onClose={closeLogProduction}
        title={t('industry.logProduction')}
      >
        {loggingModalOpen && (
          <ProductionRunForm
            key={logRequest}
            hint={t('industry.logProductionHint', { name: productName })}
            initial={defaults}
            onSubmit={(form) => void saveProductionRun(form)}
            submitLabel={t('industry.saveProductionRun')}
          />
        )}
      </Modal>

      <Modal
        open={editingRow !== undefined}
        onClose={() => setEditingRunId(null)}
        title={t('industry.editProductionRun')}
      >
        {editingRow && (
          <div className="space-y-4">
            <ProductionRunForm
              key={editingRow.run.id}
              initial={editingRow.run}
              onSubmit={(form) => void saveEdit(form)}
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

      <SaleLinkingModals sale={sale} />
    </>
  );
}

interface ProductionRunFormProps {
  hint?: string;
  /**
   * Seeds the fields once, on mount — the caller re-keys the form to start it
   * over. The raw record rather than a prepared `RunForm`: formatting it here,
   * inside the state initializer, keeps that work out of the panel's render.
   */
  initial: Pick<ProductionRunRecord, 'quantity' | 'materialCost' | 'jobFee'> | null;
  onSubmit: (form: RunForm) => void;
  submitLabel: string;
}

/** Shared body for the "Log Production" and edit-run modals: the three cost/quantity fields plus a live total. */
function ProductionRunForm({ hint, initial, onSubmit, submitLabel }: ProductionRunFormProps) {
  const [form, onChange] = useState<RunForm>(() => (initial ? runForm(initial) : EMPTY_FORM));
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
      <Button variant="primary" onClick={() => onSubmit(form)} className="w-full justify-center">
        {submitLabel}
      </Button>
    </div>
  );
}
