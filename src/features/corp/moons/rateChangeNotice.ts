/**
 * Tells a moon owner's CEO and payee, by the Officer mail queue, that the
 * accounting corporation changed its rate (#4515). Called after the rate is
 * saved: it never blocks or fails the change, and without the mail permission
 * it does nothing (the moon owner's page carries the in-app line).
 */
import {
  rateChangeEvent,
  type OwnerRateChange,
  type OwnerRateEntry,
} from '@/engine/corpTaxBook/ownerRate';
import { moonOwnerMailRecipients } from '@/engine/corpTaxBook/ownerRateMail';
import { enqueueRateChangeMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail } from '@/features/corpTaxBook/officerMail';

/** The change the agreed rate `pct` makes today, or undefined when the effective rate does not move. */
export function agreedRateChange(
  before: readonly OwnerRateEntry[],
  pct: number,
  now: Date
): OwnerRateChange | undefined {
  const date = now.toISOString().slice(0, 10);
  const after: OwnerRateEntry[] = [
    ...before,
    { kind: 'agreed', pct, effectiveFrom: date, recordedAt: now.toISOString() },
  ];
  return rateChangeEvent({ before, after, date });
}

export async function mailRateChange(input: {
  grantedScopes: readonly string[] | undefined;
  characterId: number;
  corporationId: number;
  accountingCorporationName: string;
  feederCorporationId: number;
  payee?: { kind: 'corporation' | 'character'; id: number };
  change: OwnerRateChange;
}): Promise<void> {
  // The rate is already saved; a mail that cannot be queued never undoes it.
  await queueOfficerMail({
    senderCharacterId: input.characterId,
    grantedScopes: input.grantedScopes,
    recipients: async () => {
      const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
      const owner = await loadPublicCorporationRecord(input.feederCorporationId);
      const payeeCorp =
        input.payee?.kind === 'corporation'
          ? await loadPublicCorporationRecord(input.payee.id)
          : null;
      return moonOwnerMailRecipients({
        ceoId: owner?.ceo_id ?? null,
        ...(input.payee ? { payee: input.payee } : {}),
        payeeCeoId: payeeCorp?.ceo_id ?? null,
      });
    },
    enqueue: (recipients) =>
      enqueueRateChangeMail({
        corporationId: input.corporationId,
        accountingCorporationName: input.accountingCorporationName,
        senderCharacterId: input.characterId,
        feederCorporationId: input.feederCorporationId,
        change: input.change,
        recipients,
      }),
  });
}
