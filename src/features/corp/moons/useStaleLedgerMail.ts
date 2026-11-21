/**
 * The "we can't read your ledger" mail (#6210): when an editor of the book opens it and a moon
 * owner's ledger cannot be read, their client asks the server for this stale spell's one mail
 * (the first officer to ask gets it; nobody else does, unless that officer's queue has not sent
 * it within a few hours, when the claim lapses to the next to ask) and queues it to both sides, the moon
 * owner's CEO and payee and the book's other officers, through the Officer mail queue. It
 * says by when to reconnect before EVE drops the oldest unread mining; once that is past, no mail.
 * Without the mail permission nothing is asked, so another officer's client can still send it.
 */
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
  // One ask per stale spell per page visit; the server stops a second officer.
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
