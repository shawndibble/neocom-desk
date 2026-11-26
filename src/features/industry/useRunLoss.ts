import { useState } from 'react';
import { db, type ProductionLossRecord } from '@/db';
import { removeProductionLoss, scheduleSync } from '@/sync';
import { lostUnitsCost, validateLossQuantity } from '@/engine/industry/realizedProfit';
import { unmaskNumber } from '@/lib/numberMask';
import type { ProductionRunSummary } from './productionRunSummary';

export interface LossForm {
  quantity: string;
  date: string;
  note: string;
}

export type LossError = 'invalid' | 'too-many' | null;

interface LossDialogState {
  runId: string;
  runQuantity: number;
  totalCost: number;
  quantitySold: number;
  otherLost: number;
  unaccounted: number;
  lossId: string | null;
  form: LossForm;
  error: LossError;
}

function toDateInput(ms: number): string {
  const d = new Date(ms);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function fromDateInput(value: string): number {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1).getTime();
}

export function useRunLoss(characterId: number, losses: readonly ProductionLossRecord[]) {
  const [dialog, setDialog] = useState<LossDialogState | null>(null);
  const [removingLossId, setRemovingLossId] = useState<string | null>(null);

  function openLoss(row: ProductionRunSummary, existing?: ProductionLossRecord) {
    const otherLost = row.quantityLost - (existing?.quantity ?? 0);
    const unaccounted = Math.max(0, row.run.quantity - row.quantitySold - otherLost);
    const base: LossDialogState = {
      runId: row.run.id,
      runQuantity: row.run.quantity,
      totalCost: row.run.totalCost,
      quantitySold: row.quantitySold,
      otherLost,
      unaccounted,
      lossId: existing?.id ?? null,
      error: null,
      form: {
        quantity: String(existing?.quantity ?? unaccounted),
        date: toDateInput(existing?.lostAt ?? Date.now()),
        note: existing?.note ?? '',
      },
    };
    setDialog(base);
  }

  function closeLoss() {
    setDialog(null);
  }

  function setLossForm(updater: (form: LossForm) => LossForm) {
    setDialog((state) => (state ? { ...state, form: updater(state.form), error: null } : state));
  }

  const writtenOffCost = dialog
    ? lostUnitsCost(dialog.totalCost, dialog.runQuantity, unmaskNumber(dialog.form.quantity) ?? 0)
    : null;

  async function saveLoss() {
    if (!dialog) return;
    const quantityLost = unmaskNumber(dialog.form.quantity) ?? 0;
    const error = validateLossQuantity({
      quantity: dialog.runQuantity,
      quantitySold: dialog.quantitySold,
      otherLost: dialog.otherLost,
      quantityLost,
    });
    if (error) {
      setDialog({ ...dialog, error });
      return;
    }
    const existing = dialog.lossId ? losses.find((l) => l.id === dialog.lossId) : undefined;
    const now = Date.now();
    const note = dialog.form.note.trim();
    const record: ProductionLossRecord = {
      id: existing?.id ?? `${characterId}:loss:${crypto.randomUUID()}`,
      characterId,
      runId: dialog.runId,
      quantity: quantityLost,
      lostAt: fromDateInput(dialog.form.date),
      insurancePayout: existing?.insurancePayout ?? 0,
      ...(existing?.journalEntryId !== undefined
        ? { journalEntryId: existing.journalEntryId }
        : {}),
      ...(note ? { note } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await db.productionLosses.put(record);
      scheduleSync(characterId, { collections: ['productionLosses'] });
    } catch {}
    setDialog(null);
  }

  function confirmRemoveLoss(lossId: string) {
    setRemovingLossId(lossId);
  }

  function cancelRemoveLoss() {
    setRemovingLossId(null);
  }

  async function removeLoss() {
    if (removingLossId === null) return;
    await removeProductionLoss(characterId, removingLossId);
    setRemovingLossId(null);
  }

  return {
    dialog,
    writtenOffCost,
    removingLossId,
    openLoss,
    closeLoss,
    setLossForm,
    saveLoss,
    confirmRemoveLoss,
    cancelRemoveLoss,
    removeLoss,
  };
}

export type RunLoss = ReturnType<typeof useRunLoss>;
