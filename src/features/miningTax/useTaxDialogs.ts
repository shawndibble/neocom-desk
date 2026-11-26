import { useState, useSyncExternalStore } from 'react';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import type { RowMenuAction } from '@/features/miningTax/rowMenu';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';

export interface SettleUpStart {
  payerId?: number;
}

export interface LinkPaymentTarget {
  payeeId?: string;
}

export type LedgerTarget =
  { kind: 'personal'; payeeId: string } | { kind: 'book'; corporationId: number; minerId?: string };

export interface TaxDialogState {
  detailTarget: DisplayRow | null;
  detailConfirmUnassign: boolean;
  editTarget: DisplayRow | null;
  joinTarget: DisplayRow | null;
  splitTarget: DisplayRow | null;
  joinCandidateOverride: DisplayRow[] | null;
  settleUpRows: SettleUpRow[] | null;
  settleUpStart: SettleUpStart;
  linkPaymentTarget: LinkPaymentTarget | null;
  corpPayTarget: number | null;
  corpPayFocus: { rowId: string; characterId: number } | null;
  ledgerTarget: LedgerTarget | null;
  bulkDismissOpen: boolean;
  acting: boolean;
}

const CLOSED: TaxDialogState = {
  detailTarget: null,
  detailConfirmUnassign: false,
  editTarget: null,
  joinTarget: null,
  splitTarget: null,
  joinCandidateOverride: null,
  settleUpRows: null,
  settleUpStart: {},
  linkPaymentTarget: null,
  corpPayTarget: null,
  corpPayFocus: null,
  ledgerTarget: null,
  bulkDismissOpen: false,
  acting: false,
};

type Patch = Partial<TaxDialogState>;

function createTaxDialogStore() {
  let state = CLOSED;
  const listeners = new Set<() => void>();
  const patch = (next: Patch) => {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    patch,
  };
}

export type RowMenuRunner = (action: RowMenuAction, dr: DisplayRow) => void;

function createActions(patch: (next: Patch) => void) {
  let rowMenuRunner: RowMenuRunner | null = null;
  return {
    openDetail: (dr: DisplayRow | null) =>
      patch({ detailTarget: dr, detailConfirmUnassign: false }),
    confirmUnassignFor: (dr: DisplayRow) =>
      patch({ detailTarget: dr, detailConfirmUnassign: true }),
    registerRowMenuRunner: (runner: RowMenuRunner) => {
      rowMenuRunner = runner;
      return () => {
        if (rowMenuRunner === runner) rowMenuRunner = null;
      };
    },
    runRowMenuAction: (action: RowMenuAction, dr: DisplayRow) => rowMenuRunner?.(action, dr),
    openEdit: (dr: DisplayRow | null) => patch({ editTarget: dr }),
    editFromDetail: (dr: DisplayRow) => patch({ editTarget: dr, detailTarget: null }),
    openJoin: (dr: DisplayRow | null) => patch({ joinTarget: dr }),
    joinFromDetail: (dr: DisplayRow) => patch({ joinTarget: dr, detailTarget: null }),
    combineSelected: (primary: DisplayRow, rest: DisplayRow[]) =>
      patch({ joinTarget: primary, joinCandidateOverride: rest }),
    closeJoin: () => patch({ joinTarget: null, joinCandidateOverride: null }),
    openSplit: (dr: DisplayRow | null) => patch({ splitTarget: dr }),
    splitFromDetail: (dr: DisplayRow) => patch({ splitTarget: dr, detailTarget: null }),
    openSettleUp: (rows: SettleUpRow[] | null, start: SettleUpStart = {}) =>
      patch({ settleUpRows: rows, settleUpStart: start }),
    openLinkPayment: (target: LinkPaymentTarget | null) => patch({ linkPaymentTarget: target }),
    linkPaymentFromDetail: (target: LinkPaymentTarget) =>
      patch({ linkPaymentTarget: target, detailTarget: null }),
    openCorpPay: (corporationId: number | null) =>
      patch({ corpPayTarget: corporationId, corpPayFocus: null }),
    corpPayFromDetail: (corporationId: number, focus: { rowId: string; characterId: number }) =>
      patch({ corpPayTarget: corporationId, corpPayFocus: focus, detailTarget: null }),
    openLedger: (target: LedgerTarget | null) => patch({ ledgerTarget: target }),
    openBulkDismiss: (open: boolean) => patch({ bulkDismissOpen: open }),
    setActing: (acting: boolean) => patch({ acting }),
  };
}

export type TaxDialogActions = ReturnType<typeof createActions>;
export type TaxDialogStore = ReturnType<typeof createTaxDialogStore>;

export function useTaxDialogs() {
  const [bundle] = useState(() => {
    const store = createTaxDialogStore();
    return { store, actions: createActions(store.patch) };
  });
  return bundle;
}

export function useTaxDialogState(store: TaxDialogStore): TaxDialogState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

export function useTaxDialogSelector<T>(
  store: TaxDialogStore,
  select: (state: TaxDialogState) => T
): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
