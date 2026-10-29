import type { RefObject } from 'react';
import type { DisplayRow } from '@/features/miningTax/groupRows';
import { settleUpMembers, type combineEligibility } from '@/features/miningTax/selection';
import { SelectionToolbar } from '@/features/miningTax/SelectionToolbar';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import type { TaxDialogActions } from '@/features/miningTax/useTaxDialogs';

interface TaxSelectionBarProps {
  toolbarRef: RefObject<HTMLDivElement | null>;
  selectedRows: DisplayRow[];
  selectableVisible: DisplayRow[];
  selection: ReadonlySet<string>;
  onSelectAll: (keys: Set<string>) => void;
  onClear: () => void;
  selectedSettleUpRows: SettleUpRow[];
  onSettleUp: (rows: SettleUpRow[]) => void;
  combine: ReturnType<typeof combineEligibility>;
  onCombine: () => void;
  dismissCount: number;
  selectedPayeeIds: (string | undefined)[];
  linkSelectedBlocked: string | null;
  actions: TaxDialogActions;
}

/**
 * Pinned above the phone tab bar (and to the bottom of the viewport on
 * desktop), so the bulk actions stay in reach wherever the ticked row sits
 * in a long ledger.
 */
export function TaxSelectionBar({
  toolbarRef,
  selectedRows,
  selectableVisible,
  selection,
  onSelectAll,
  onClear,
  selectedSettleUpRows,
  onSettleUp,
  combine,
  onCombine,
  dismissCount,
  selectedPayeeIds,
  linkSelectedBlocked,
  actions,
}: TaxSelectionBarProps) {
  return (
    <div ref={toolbarRef} className="sticky bottom-[var(--bottom-nav-clearance)] z-30 md:bottom-3">
      <SelectionToolbar
        selectedCount={selectedRows.length}
        canSelectAll={selectableVisible.some((dr) => !selection.has(dr.key))}
        onSelectAll={() => onSelectAll(new Set(selectableVisible.map((dr) => dr.key)))}
        onClear={onClear}
        settleUpCount={selectedSettleUpRows.length}
        onSettleUp={() => onSettleUp(selectedSettleUpRows)}
        combine={combine}
        onCombine={onCombine}
        dismissCount={dismissCount}
        onDismiss={() => actions.openBulkDismiss(true)}
        linkPaymentBlockedReason={linkSelectedBlocked}
        onLinkPayment={() => {
          const payeeId = selectedPayeeIds[0];
          if (!payeeId) return;
          actions.openLinkWallet({
            payeeId,
            members: settleUpMembers(selectedRows),
          });
        }}
      />
    </div>
  );
}
