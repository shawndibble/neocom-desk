import { useEffect, useRef } from 'react';
import { useGrantedScopes } from '@/app/useGrantedScopes';
import { oreLostOn, staleLedgerClock } from '@/engine/corpTaxBook/feederHealth';
import { staleLedgerMailDue, type MoonOwnerRow } from '@/engine/corpTaxBook/moonOwners';
import { enqueueGrantStaleMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail } from '@/features/corpTaxBook/officerMail';
import { claimFeederStaleMail } from '../taxBook/feederClient';
import { useCorporationName } from './lateNoticeMailing';
import { useBook } from './useBook';

export function useStaleLedgerMail(rows: readonly MoonOwnerRow[]): void {
  const { canEdit, characterId, corporationId, names } = useBook();
  const grantedScopes = useGrantedScopes();
  const accountingName = useCorporationName();
  const asked = useRef(new Set<string>());

  useEffect(() => {
    if (!canEdit || !accountingName || grantedScopes === undefined) return;
    for (const row of rows) {
      if (row.staleSince === undefined || !staleLedgerMailDue(row, new Date().toISOString()))
        continue;
      const staleSince = row.staleSince;
      const key = `${row.corporationId}:${staleSince}`;
      if (asked.current.has(key)) continue;
      asked.current.add(key);
      void queueOfficerMail({
        senderCharacterId: characterId,
        grantedScopes,
        recipients: async () =>
          (await claimFeederStaleMail(characterId, corporationId, row.corporationId)).recipients,
        enqueue: (recipients) =>
          enqueueGrantStaleMail({
            corporationId,
            accountingCorporationName: accountingName,
            moonOwnerName: names.corporation(row.corporationId),
            senderCharacterId: characterId,
            feederCorporationId: row.corporationId,
            staleSince,
            lostOn: oreLostOn(staleLedgerClock(staleSince, row.lastReadWellAt)),
            recipients,
          }),
      });
    }
  }, [rows, canEdit, accountingName, grantedScopes, characterId, corporationId, names]);
}
