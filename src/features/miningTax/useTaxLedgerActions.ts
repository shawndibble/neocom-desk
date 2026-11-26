import type { DisplayRow, GroupMember } from '@/features/miningTax/groupRows';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';
import { defaultPayer } from '@/features/miningTax/settlePayer';
import type { TaxDialogActions } from '@/features/miningTax/useTaxDialogs';

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

  function settleUpBalance(members: readonly GroupMember[]) {
    openSettleUpFor(settleUpRowsFor(members));
  }

  function assignNext() {
    const next = [...characterFiltered]
      .filter((dr) => dr.status === 'unassigned' && !dr.corp)
      .sort((a, b) => b.row.entry.date.localeCompare(a.row.entry.date))[0];
    if (next) actions.openDetail(next);
  }

  return { openSettleUpFor, settleUpBalance, assignNext };
}
