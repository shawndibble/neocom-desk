/**
 * Tells a moon owner's CEO and payee, by the short mail queue, that the
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

export const SEND_MAIL_SCOPE = 'esi-mail.send_mail.v1';

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
  if (!input.grantedScopes?.includes(SEND_MAIL_SCOPE)) return;
  try {
    const [{ loadPublicCorporationRecord }, { resolveNames }, { enqueueRateChangeMail }] =
      await Promise.all([
        import('@/features/character/publicInfoData'),
        import('@/features/character/names'),
        import('@/features/corpTaxBook/mailQueue'),
      ]);
    const owner = await loadPublicCorporationRecord(input.feederCorporationId);
    const payeeCorp =
      input.payee?.kind === 'corporation'
        ? await loadPublicCorporationRecord(input.payee.id)
        : null;
    const ids = moonOwnerMailRecipients({
      ceoId: owner?.ceo_id ?? null,
      ...(input.payee ? { payee: input.payee } : {}),
      payeeCeoId: payeeCorp?.ceo_id ?? null,
    });
    if (ids.length === 0) return;
    const names = await resolveNames(ids);
    await enqueueRateChangeMail({
      corporationId: input.corporationId,
      accountingCorporationName: input.accountingCorporationName,
      senderCharacterId: input.characterId,
      feederCorporationId: input.feederCorporationId,
      change: input.change,
      recipients: ids.map((id) => ({ id, name: names.get(id) ?? `#${id}` })),
    });
  } catch {
    // The rate is already saved; a mail that cannot be queued never undoes it.
  }
}
