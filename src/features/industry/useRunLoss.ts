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
  /** `YYYY-MM-DD`, the local day the units were lost. */
  date: string;
  insuranceMode: LossInsuranceMode;
  /** Typed ISK for `insuranceMode: 'isk'`. */
  isk: string;
  journalEntryId: number | null;
  note: string;
}

export type LossError = 'invalid' | 'too-many' | null;

interface LossDialogState {
  runId: string;
  runQuantity: number;
  totalCost: number;
  /** Units neither sold nor lost by any *other* loss record — the most this loss may claim. */
  unaccounted: number;
  /** Set when editing an existing loss. */
  lossId: string | null;
  walletAvailable: boolean;
  journal: WalletJournalEntry[];
  form: LossForm;
  error: LossError;
}

/** Wallet-journal insurance payouts are offered for this long after the fact. */
const JOURNAL_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
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

/** The insurance ISK a form currently commits, whichever way it was entered. */
function formInsurance(form: LossForm, journal: readonly WalletJournalEntry[]): number {
  if (form.insuranceMode === 'none') return 0;
  if (form.insuranceMode === 'isk') return Math.max(0, unmaskNumber(form.isk) ?? 0);
  return journal.find((e) => e.id === form.journalEntryId)?.amount ?? 0;
}

/**
 * Run Loss state (issue #2851): the "Mark as lost…" / "Edit loss…" dialog and
 * the remove confirmation, shared by `ProductionRunsPanel` and
 * `ProductionLogPanel` alongside `useSaleLinking`. A loss is its own record
 * (several per run), written straight to Dexie and synced like a sale link.
 */
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
    // A Character without the wallet scope can still type the ISK.
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
        // Premiums are negative debits; only payouts are a loss's insurance.
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
      quantitySold: 0,
      // `unaccounted` already excludes this loss's own units and the run's sales.
      otherLost: dialog.runQuantity - dialog.unaccounted,
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
      scheduleSync(characterId);
    } catch {
      // A concurrent write of the same payout from another device; the list
      // refreshes on the next live query.
    }
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
    // `removeProductionLoss` tombstones and schedules its own sync.
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
