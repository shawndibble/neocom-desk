import { useEffect } from 'react';
import { moonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { recordFeederPayout } from '../taxBook/feederClient';
import { PayMoonOwnerDialog } from './PayMoonOwnerDialog';
import { useBook } from './useBook';
import { useMoonOwnersInput } from './useMoonOwners';

/**
 * Pay for one moon owner (or "Add a payment" by hand), wired to the book:
 * the table row and the moon owner page both open this, so both record through
 * the same callable and read the same balance.
 */
export function PayMoonOwnerHost({
  corporationId: owner,
  manual = false,
  onClose,
}: {
  /** The moon owner's corporation id. */
  corporationId: number;
  manual?: boolean;
  onClose: () => void;
}) {
  const { names, characterId, corporationId, reload, data, requestRows } = useBook();
  const input = useMoonOwnersInput();
  // The balance and the period come from the ledger rows, which the Moon owners tab may not hold.
  useEffect(() => requestRows?.(), [requestRows]);
  const detail = moonOwnerDetail(input, owner);
  if (!detail || !(data.parts?.has('observed') ?? true)) return null;
  const payeeName =
    detail.payee.kind === 'character'
      ? names.character(detail.payee.id)
      : names.corporation(detail.payee.id);
  return (
    <PayMoonOwnerDialog
      ownerName={names.corporation(owner)}
      payee={{ id: detail.payee.id, name: payeeName }}
      balance={detail.accrued - detail.paid}
      period={detail.period}
      manual={manual}
      onClose={onClose}
      onRecord={async (payout) => {
        try {
          await recordFeederPayout(characterId, corporationId, owner, payout);
        } finally {
          reload();
        }
      }}
    />
  );
}
