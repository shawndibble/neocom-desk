import {
  rateChangeEvent,
  type OwnerRateChange,
  type OwnerRateEntry,
} from '@/engine/corpTaxBook/ownerRate';
import { moonOwnerMailRecipients } from '@/engine/corpTaxBook/ownerRateMail';
import { enqueueModeChangeMail, enqueueRateChangeMail } from '@/features/corpTaxBook/mailQueue';
import { queueOfficerMail } from '@/features/corpTaxBook/officerMail';
import { utcDay } from '@/engine/localDay';

export function agreedRateChange(
  before: readonly OwnerRateEntry[],
  pct: number,
  now: Date,
  asOf: string = utcDay(now.getTime())
): OwnerRateChange | undefined {
  const after: OwnerRateEntry[] = [
    ...before,
    { kind: 'agreed', pct, effectiveFrom: asOf, recordedAt: now.toISOString(), noBackdate: true },
  ];
  return rateChangeEvent({ before, after, date: asOf });
}

type Payee = { kind: 'corporation' | 'character'; id: number };

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
  at: number;
}): Promise<void> {
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
