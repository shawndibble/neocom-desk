import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { DisplayRow, GroupMember } from '@/features/miningTax/groupRows';
import {
  combineEligibility,
  dismissableRows,
  settleUpMembers,
} from '@/features/miningTax/selection';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import type { TaxDialogActions } from '@/features/miningTax/useTaxDialogs';
import { isSelectableRow } from '@/features/miningTax/useTaxColumns';
import { useStickyClearance } from '@/lib/useStickyClearance';

/**
 * The Open table's select column and what the bulk actions read from it.
 * Feeds all three (settle up / combine / dismiss), never just bulk-pay.
 */
export function useTaxSelection(
  openRows: readonly DisplayRow[],
  settleUpRowsFor: (members: readonly GroupMember[]) => SettleUpRow[],
  actions: TaxDialogActions
) {
  const { t } = useTranslation();
  const toolbarRef = useRef<HTMLDivElement>(null);
  // Row keys checked in the Open table's select column.
  const [selection, setSelection] = useState<ReadonlySet<string>>(new Set());

  // Every bulk action reads the selection narrowed to what is *on screen*:
  // selection state survives a filter change, so acting on the full set would
  // let Dismiss reach entries the pilot cannot see.
  const selectedRows = useMemo(
    () => openRows.filter((dr) => selection.has(dr.key)),
    [openRows, selection]
  );
  // The sticky toolbar covers the page bottom: reserve its height as scroll padding so a focused row clears it.
  useStickyClearance(toolbarRef, 'selection-toolbar', {
    enabled: selectedRows.length > 0,
  });

  const selectedSettleUpRows: SettleUpRow[] = useMemo(
    () => settleUpRowsFor(settleUpMembers(selectedRows)),
    [selectedRows, settleUpRowsFor]
  );

  const combine = useMemo(() => combineEligibility(selectedRows), [selectedRows]);
  const dismissTargets = useMemo(() => dismissableRows(selectedRows), [selectedRows]);

  function handleCombineSelected() {
    if (!combine.ok) return;
    const [primary, ...rest] = combine.rows;
    actions.combineSelected(primary, rest);
  }

  const toggleRowSelected = useCallback((key: string) => {
    setSelection((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelection(new Set()), []);

  const selectableVisible = openRows.filter(isSelectableRow);

  // The selection bar's "Link payment": one transfer pays one Payee.
  const selectedPayeeIds = [...new Set(selectedSettleUpRows.map((r) => r.assignment.payeeId))];
  const linkSelectedBlocked =
    selectedSettleUpRows.length === 0
      ? t('miningTax.settleUpBlockedHint')
      : selectedPayeeIds.length > 1
        ? t('miningTax.linkPaymentOnePayeeHint')
        : null;

  return {
    toolbarRef,
    selection,
    setSelection,
    selectedRows,
    selectedSettleUpRows,
    selectedPayeeIds,
    linkSelectedBlocked,
    selectableVisible,
    combine,
    dismissTargets,
    handleCombineSelected,
    toggleRowSelected,
    clearSelection,
  };
}
