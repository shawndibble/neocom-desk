import type { DisplayRow, GroupMember } from '@/features/miningTax/groupRows';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import { defaultPayer } from '@/features/miningTax/settlePayer';
import type { TaxDialogActions } from '@/features/miningTax/useTaxDialogs';

/** The balance cards' and the selection bar's routes into a dialog. */
export function useTaxLedgerActions(
  actions: TaxDialogActions,
  activeCharacterId: number | null,
  characterFiltered: readonly DisplayRow[],
  settleUpRowsFor: (members: readonly GroupMember[]) => SettleUpRow[]
) {
  function openSettleUpFor(rows: SettleUpRow[]) {
    const payerId = defaultPayer(rows, activeCharacterId);
    actions.openSettleUp(rows, payerId === null ? {} : { payerId });
  }

  /**
   * "Pay them in one lump sum": every Outstanding Assignment behind one
   * balance, straight into Settle up — paid by the active Character when it
   * owes some, so a balance spanning Characters isn't one blended figure.
   */
  function settleUpBalance(members: readonly GroupMember[]) {
    openSettleUpFor(settleUpRowsFor(members));
  }

  /** The "Assign next" shortcut: the newest still-unassigned entry, opened straight into its Assign form. */
  function assignNext() {
    const next = [...characterFiltered]
      .filter((dr) => dr.status === 'unassigned' && !dr.corp)
      .sort((a, b) => b.row.entry.date.localeCompare(a.row.entry.date))[0];
    if (next) actions.openDetail(next);
  }

  return { openSettleUpFor, settleUpBalance, assignNext };
}
