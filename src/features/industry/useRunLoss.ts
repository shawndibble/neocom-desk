import { DAY_MS } from '@/lib/age';
import { useState } from 'react';
import { db, type ProductionLossRecord } from '@/db';
import { removeProductionLoss, scheduleSync } from '@/sync';
import { hasWalletScope, loadWalletJournal } from '@/features/character/wallet';
import type { WalletJournalEntry } from '@/esi/endpoints';
import {
  runLoss,
  validateLossQuantity,
  type RunLossResult,
} from '@/engine/industry/realizedProfit';
import { unmaskNumber } from '@/lib/numberMask';
import type { ProductionRunSummary } from './productionRunSummary';

export type LossInsuranceMode = 'wallet' | 'isk' | 'none';

export interface LossForm {
  quantity: string;
  date: string;
  insuranceMode: LossInsuranceMode;
  isk: string;
  journalEntryId: number | null;
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
  walletAvailable: boolean;
  journal: WalletJournalEntry[];
  form: LossForm;
  error: LossError;
}

const JOURNAL_WINDOW_MS = 30 * DAY_MS;
const INSURANCE_REF_TYPE = 'insurance';

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

function formInsurance(form: LossForm, journal: readonly WalletJournalEntry[]): number {
  if (form.insuranceMode === 'none') return 0;
  if (form.insuranceMode === 'isk') return Math.max(0, unmaskNumber(form.isk) ?? 0);
  return journal.find((e) => e.id === form.journalEntryId)?.amount ?? 0;
}

export function useRunLoss(characterId: number, losses: readonly ProductionLossRecord[]) {
  const [dialog, setDialog] = useState<LossDialogState | null>(null);
  const [removingLossId, setRemovingLossId] = useState<string | null>(null);

  async function openLoss(row: ProductionRunSummary, existing?: ProductionLossRecord) {
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
      walletAvailable: false,
      journal: [],
      error: null,
      form: {
        quantity: String(existing?.quantity ?? unaccounted),
        date: toDateInput(existing?.lostAt ?? Date.now()),
        insuranceMode: existing
          ? existing.journalEntryId !== undefined
            ? 'wallet'
            : existing.insurancePayout > 0
              ? 'isk'
              : 'none'
          : 'none',
        isk:
          existing && existing.journalEntryId === undefined ? String(existing.insurancePayout) : '',
        journalEntryId: existing?.journalEntryId ?? null,
        note: existing?.note ?? '',
      },
    };
    setDialog(base);
    if (!(await hasWalletScope(characterId))) return;
    const cached = await loadWalletJournal(characterId);
    const taken = new Set(
      losses.flatMap((l) =>
        l.journalEntryId !== undefined && l.id !== existing?.id ? [l.journalEntryId] : []
      )
    );
    const cutoff = Date.now() - JOURNAL_WINDOW_MS;
    const journal = (cached?.data ?? []).filter(
      (e) =>
        e.ref_type === INSURANCE_REF_TYPE &&
        (e.amount ?? 0) > 0 &&
        !taken.has(e.id) &&
        (new Date(e.date).getTime() >= cutoff || e.id === existing?.journalEntryId)
    );
    setDialog((state) =>
      state && state.runId === base.runId ? { ...state, walletAvailable: true, journal } : state
    );
  }

  function closeLoss() {
    setDialog(null);
  }

  function setLossForm(updater: (form: LossForm) => LossForm) {
    setDialog((state) => (state ? { ...state, form: updater(state.form), error: null } : state));
  }

  const preview: (RunLossResult & { units: number }) | null = dialog
    ? {
        ...runLoss({
          totalCost: dialog.totalCost,
          quantity: dialog.runQuantity,
          quantityLost: unmaskNumber(dialog.form.quantity) ?? 0,
          insurancePayout: formInsurance(dialog.form, dialog.journal),
        }),
        units: unmaskNumber(dialog.form.quantity) ?? 0,
      }
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
    const journalEntryId =
      dialog.form.insuranceMode === 'wallet' && dialog.form.journalEntryId !== null
        ? dialog.form.journalEntryId
        : undefined;
    const note = dialog.form.note.trim();
    const record: ProductionLossRecord = {
      id:
        existing?.id ??
        `${characterId}:loss:${journalEntryId !== undefined ? journalEntryId : crypto.randomUUID()}`,
      characterId,
      runId: dialog.runId,
      quantity: quantityLost,
      lostAt: fromDateInput(dialog.form.date),
      insurancePayout: formInsurance(dialog.form, dialog.journal),
      ...(journalEntryId !== undefined ? { journalEntryId } : {}),
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
    preview,
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
