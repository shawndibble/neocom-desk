/**
 * Tells the other side, by the short mail queue, that a moon owner's payee changed (#4653).
 * Called after the change is saved with the recipients the server named: it never blocks or
 * fails the change, and without the mail permission it does nothing (both pages carry the
 * in-app notice).
 */
import { utcDay } from '@/engine/localDay';
import { SEND_MAIL_SCOPE } from './rateChangeNotice';

/** Whether this officer's token can send the mail, so the change asks whom to tell. */
export const canMail = (grantedScopes: readonly string[] | undefined): boolean =>
  grantedScopes?.includes(SEND_MAIL_SCOPE) ?? false;

export async function mailPayeeChange(input: {
  grantedScopes: readonly string[] | undefined;
  /** The officer who changed it: the mail goes from this character. */
  characterId: number;
  /** The officer's own corporation. */
  corporationId: number;
  feederCorporationId: number;
  /** Character ids the server named: the other side. */
  recipients: readonly number[];
  /** The corporation whose officer changed it. */
  changedByName: string;
  moonOwnerName: string;
  payeeName: string;
  /** When it changed (ms): the server's stamp, so one change is mailed once per recipient. */
  at: number;
}): Promise<void> {
  if (!canMail(input.grantedScopes) || input.recipients.length === 0) return;
  try {
    const [{ resolveNames }, { enqueuePayeeChangeMail }] = await Promise.all([
      import('@/features/character/names'),
      import('@/features/corpTaxBook/mailQueue'),
    ]);
    const names = await resolveNames([...input.recipients]);
    await enqueuePayeeChangeMail({
      corporationId: input.corporationId,
      senderCharacterId: input.characterId,
      feederCorporationId: input.feederCorporationId,
      at: input.at,
      date: utcDay(input.at),
      changedByName: input.changedByName,
      moonOwnerName: input.moonOwnerName,
      payeeName: input.payeeName,
      recipients: input.recipients.map((id) => ({ id, name: names.get(id) ?? `#${id}` })),
    });
  } catch {
    // The payee is already saved; a mail that cannot be queued never undoes it.
  }
}
