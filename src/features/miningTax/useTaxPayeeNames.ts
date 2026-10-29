import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { PayeeRecord } from '@/db';
import type { DisplayRow, GroupMember } from '@/features/miningTax/groupRows';
import type { SettleUpRow } from '@/features/miningTax/SettleUpDialog';

/** How the Tax tab names a Payee, and turns owed members into Settle up's rows. */
export function useTaxPayeeNames(
  ledgerPayees: readonly PayeeRecord[],
  payeeById: ReadonlyMap<string, PayeeRecord>
) {
  const { t } = useTranslation();

  const payeeName = useCallback(
    (payeeId: string | undefined): string =>
      ledgerPayees.find((p) => p.id === payeeId)?.name ?? t('miningTax.unknownPayee'),
    [ledgerPayees, t]
  );

  /** The detail modal's Payee display: a resolved name, "No tax owed" for a dismissal, or a dash when unassigned. */
  const payeeDisplayName = useCallback(
    (dr: DisplayRow): string => {
      // Before the corp's record is final, its name is the hint of whose it will be (D12).
      if (dr.corp?.kind === 'label' && dr.corp.state === 'pending') {
        return t('miningTax.corpBook.payeeName', { corp: dr.corp.corpName });
      }
      if (dr.corp?.kind === 'row') return payeeName(dr.assignment?.payeeId);
      if (!dr.assignment) return '—';
      if (dr.assignment.status === 'dismissed') return t('miningTax.dismissedLabel');
      return payeeName(dr.assignment.payeeId);
    },
    [payeeName, t]
  );

  const settleUpRowsFor = useCallback(
    (members: readonly GroupMember[]): SettleUpRow[] =>
      members.map((m) => {
        const payeeId = m.assignment.payeeId;
        const entityId = payeeById.get(payeeId ?? '')?.entityId;
        return {
          assignment: m.assignment,
          characterName: m.row.characterName,
          payeeName: payeeName(payeeId),
          ...(payeeId === undefined ? {} : { payeeId }),
          ...(entityId === undefined ? {} : { payeeEntityId: entityId }),
        };
      }),
    [payeeById, payeeName]
  );

  return { payeeName, payeeDisplayName, settleUpRowsFor };
}
