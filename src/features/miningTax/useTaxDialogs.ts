import { useState, useSyncExternalStore } from 'react';
import type { DisplayRow, GroupMember } from '@/features/miningTax/groupRows';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';

export interface SettleUpStart {
  payerId?: number;
  focusIds?: ReadonlySet<string>;
}

/** Whose owed entries "Link a wallet payment" is choosing a payment for: a Payee's whole balance, or just the entries ticked or settling. */
export interface LinkWalletTarget {
  payeeId: string;
  members?: readonly GroupMember[];
}

/** Which Mining Tax dialog is open, and on what. `null` / `false` keeps each one closed. */
export interface TaxDialogState {
  detailTarget: DisplayRow | null;
  /** The entry whose edit form is open — single or combined, owed or paid (mockup F1). */
  editTarget: DisplayRow | null;
  /** Kept apart from `detailTarget` so the manual picker can sit on top of the row detail (issue #540 follow-up). */
  linkTransactionTarget: DisplayRow | null;
  joinTarget: DisplayRow | null;
  splitTarget: DisplayRow | null;
  /** Set only by the selection toolbar's Combine: pins the Join dialog to exactly the ticked rows and pre-ticks them. */
  joinCandidateOverride: DisplayRow[] | null;
  /** What Settle up is settling: a balance card's whole balance, or the table's selection. */
  settleUpRows: SettleUpRow[] | null;
  /** Who pays, and (from one entry) which entries start ticked — `SettleUpDialog`'s `payerId` / `focusIds`. */
  settleUpStart: SettleUpStart;
  linkWalletTarget: LinkWalletTarget | null;
  corpPayTarget: number | null;
  bulkDismissOpen: boolean;
  linkPaymentOpen: boolean;
  /** Whether a dialog's ledger action is writing; mirrored here so `TaxTab` can disable its own controls. */
  acting: boolean;
}

const CLOSED: TaxDialogState = {
  detailTarget: null,
  editTarget: null,
  linkTransactionTarget: null,
  joinTarget: null,
  splitTarget: null,
  joinCandidateOverride: null,
  settleUpRows: null,
  settleUpStart: {},
  linkWalletTarget: null,
  corpPayTarget: null,
  bulkDismissOpen: false,
  linkPaymentOpen: false,
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

/** Every opener is stable for the life of the tab, so handing them to the tables never re-renders them. */
function createActions(patch: (next: Patch) => void) {
  return {
    openDetail: (dr: DisplayRow | null) => patch({ detailTarget: dr }),
    openEdit: (dr: DisplayRow | null) => patch({ editTarget: dr }),
    /** Edit replaces the detail view it was opened from. */
    editFromDetail: (dr: DisplayRow) => patch({ editTarget: dr, detailTarget: null }),
    openLinkTransaction: (dr: DisplayRow | null) => patch({ linkTransactionTarget: dr }),
    openJoin: (dr: DisplayRow | null) => patch({ joinTarget: dr }),
    joinFromDetail: (dr: DisplayRow) => patch({ joinTarget: dr, detailTarget: null }),
    /** The selection toolbar's Combine: `primary` plus exactly the other ticked rows. */
    combineSelected: (primary: DisplayRow, rest: DisplayRow[]) =>
      patch({ joinTarget: primary, joinCandidateOverride: rest }),
    closeJoin: () => patch({ joinTarget: null, joinCandidateOverride: null }),
    openSplit: (dr: DisplayRow | null) => patch({ splitTarget: dr }),
    splitFromDetail: (dr: DisplayRow) => patch({ splitTarget: dr, detailTarget: null }),
    openSettleUp: (rows: SettleUpRow[] | null, start: SettleUpStart = {}) =>
      patch({ settleUpRows: rows, settleUpStart: start }),
    openLinkWallet: (target: LinkWalletTarget | null) => patch({ linkWalletTarget: target }),
    linkWalletFromDetail: (target: LinkWalletTarget) =>
      patch({ linkWalletTarget: target, detailTarget: null }),
    openCorpPay: (corporationId: number | null) => patch({ corpPayTarget: corporationId }),
    corpPayFromDetail: (corporationId: number) =>
      patch({ corpPayTarget: corporationId, detailTarget: null }),
    openBulkDismiss: (open: boolean) => patch({ bulkDismissOpen: open }),
    openLinkPayment: (open: boolean) => patch({ linkPaymentOpen: open }),
    setActing: (acting: boolean) => patch({ acting }),
  };
}

export type TaxDialogActions = ReturnType<typeof createActions>;
export type TaxDialogStore = ReturnType<typeof createTaxDialogStore>;

/**
 * The Tax tab's ~dozen dialog targets, held outside `TaxTab`'s own state so
 * opening, switching or closing a dialog re-renders only `TaxDialogsHost`
 * (which subscribes via `useTaxDialogState`), never the Open and History
 * tables. `store` and `actions` are created once and never change identity.
 */
export function useTaxDialogs() {
  const [bundle] = useState(() => {
    const store = createTaxDialogStore();
    return { store, actions: createActions(store.patch) };
  });
  return bundle;
}

/** Subscribe to the whole dialog state — the host's view. */
export function useTaxDialogState(store: TaxDialogStore): TaxDialogState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

/** Subscribe to one field, so the subscriber re-renders only when that field changes. */
export function useTaxDialogSelector<T>(
  store: TaxDialogStore,
  select: (state: TaxDialogState) => T
): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()));
}
