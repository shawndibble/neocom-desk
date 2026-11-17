/**
 * Tells a moon owner's CEO and payee, by the Officer mail queue, that the
 * accounting corporation changed its rate (#4515) or turned settled otherwise on
 * or off (#6209). Called after the change is saved: it never blocks or fails the
 * change, and without the mail permission it does nothing (the moon owner's page
 * carries the in-app line).
 */
import {
  rateChangeEvent,
  type OwnerRateChange,
  type OwnerRateEntry,
} from '@/engine/corpTaxBook/ownerRate';
import { moonOwnerMailRecipients } from '@/engine/corpTaxBook/ownerRateMail';
import { enqueueModeChangeMail, enqueueRateChangeMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail } from '@/features/corpTaxBook/officerMail';
import { utcDay } from '@/engine/localDay';

/** The change the agreed rate `pct` makes from `asOf` (today by default), or undefined when the effective rate does not move. */
export function agreedRateChange(
  before: readonly OwnerRateEntry[],
  pct: number,
  now: Date,
  asOf: string = utcDay(now.getTime())
): OwnerRateChange | undefined {
  const date = asOf;
  const after: OwnerRateEntry[] = [
    ...before,
    { kind: 'agreed', pct, effectiveFrom: date, recordedAt: now.toISOString(), noBackdate: true },
  ];
  return rateChangeEvent({ before, after, date });
}

type Payee = { kind: 'corporation' | 'character'; id: number };

/** The moon owner's CEO and its payee (a corporation payee through its CEO), read live. */
async function ownerRecipients(feederCorporationId: number, payee: Payee | undefined) {
  const { loadPublicCorporationRecord } = await import('@/features/character/publicInfoData');
  const owner = await loadPublicCorporationRecord(feederCorporationId);
  const payeeCorp =
    payee?.kind === 'corporation' ? await loadPublicCorporationRecord(payee.id) : null;
  return moonOwnerMailRecipients({
    ceoId: owner?.ceo_id ?? null,
    ...(payee ? { payee } : {}),
    payeeCeoId: payeeCorp?.ceo_id ?? null,
  });
}

export async function mailModeChange(input: {
  grantedScopes: readonly string[] | undefined;
  characterId: number;
  corporationId: number;
  accountingCorporationName: string;
  feederCorporationId: number;
  payee?: Payee;
  mode: 'normal' | 'settled-otherwise';
  /** When the switch was saved (ms). */
  at: number;
}): Promise<void> {
  // The mode is already saved; a mail that cannot be queued never undoes it.
  await queueOfficerMail({
    senderCharacterId: input.characterId,
    grantedScopes: input.grantedScopes,
    recipients: () => ownerRecipients(input.feederCorporationId, input.payee),
    enqueue: (recipients) =>
      enqueueModeChangeMail({
        corporationId: input.corporationId,
        accountingCorporationName: input.accountingCorporationName,
        senderCharacterId: input.characterId,
        feederCorporationId: input.feederCorporationId,
        mode: input.mode,
        at: input.at,
        recipients,
      }),
  });
}

export async function mailRateChange(input: {
  grantedScopes: readonly string[] | undefined;
  characterId: number;
  corporationId: number;
  accountingCorporationName: string;
  feederCorporationId: number;
  payee?: Payee;
  change: OwnerRateChange;
}): Promise<void> {
  // The rate is already saved; a mail that cannot be queued never undoes it.
  await queueOfficerMail({
    senderCharacterId: input.characterId,
    grantedScopes: input.grantedScopes,
    recipients: () => ownerRecipients(input.feederCorporationId, input.payee),
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
