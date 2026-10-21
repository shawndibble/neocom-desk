/**
 * Tells the other side, by the short mail queue, that a moon owner's payee changed (#4653).
 * Called after the change is saved with the recipients the server named: it never blocks or
 * fails the change, and without the mail permission it does nothing (both pages carry the
 * in-app notice).
 */
import { SEND_MAIL_SCOPE } from './rateChangeNotice';

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
  now?: Date;
}): Promise<void> {
  if (!input.grantedScopes?.includes(SEND_MAIL_SCOPE) || input.recipients.length === 0) return;
  try {
    const [{ resolveNames }, { enqueuePayeeChangeMail }] = await Promise.all([
      import('@/features/character/names'),
      import('@/features/corpTaxBook/mailQueue'),
    ]);
    const names = await resolveNames([...input.recipients]);
    const now = input.now ?? new Date();
    await enqueuePayeeChangeMail({
      corporationId: input.corporationId,
      senderCharacterId: input.characterId,
      feederCorporationId: input.feederCorporationId,
      at: now.getTime(),
      date: now.toISOString().slice(0, 10),
      changedByName: input.changedByName,
      moonOwnerName: input.moonOwnerName,
      payeeName: input.payeeName,
      recipients: input.recipients.map((id) => ({ id, name: names.get(id) ?? `#${id}` })),
    });
  } catch {
    // The payee is already saved; a mail that cannot be queued never undoes it.
  }
}
