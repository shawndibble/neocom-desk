import { useEffect } from 'react';
import { moonOwnerDetail } from '@/engine/corpTaxBook/moonOwners';
import { recordFeederPayout } from '../taxBook/feederClient';
import { PayMoonOwnerDialog } from './PayMoonOwnerDialog';
import { useBook } from './useBook';
import { useMoonOwnersInput } from './useMoonOwners';

export function PayMoonOwnerHost({
  corporationId: owner,
  manual = false,
  onClose,
}: {
  corporationId: number;
  manual?: boolean;
  onClose: () => void;
}) {
  const { names, characterId, corporationId, reload, data, requestRows } = useBook();
  const input = useMoonOwnersInput();
  useEffect(() => requestRows?.(), [requestRows]);
  const detail = moonOwnerDetail(input, owner);
  if (!detail || !data.parts.has('observed')) return null;
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
