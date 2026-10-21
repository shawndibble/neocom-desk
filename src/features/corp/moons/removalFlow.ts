import { composeRemovalCancelledMail, composeRemovalMail } from '@/engine/corpTaxBook/removalMail';
import { resolveNames } from '@/features/character/names';
import { enqueueRemovalMails } from '@/features/corpTaxBook/mailQueue';
import {
  cancelFeederRemoval,
  recordFeederRemovalSent,
  startFeederRemoval,
} from '../taxBook/feederClient';

export interface RemovalContext {
  /** The signed-in officer's character, who sends the mail. */
  characterId: number;
  /** The accounting corporation (the book's). */
  corporationId: number;
  feederCorporationId: number;
  accountingName: string;
  ownerName: string;
  officerName: string;
}

/** `/corp-tax-book/remove-now/<code>`: the payee's page, served by `routes/CorpTaxBookRemoveNow`. */
export function removeNowUrl(origin: string, code: string): string {
  return `${origin}/corp-tax-book/remove-now/${code}`;
}

async function recipientList(ids: readonly number[]): Promise<{ id: number; name: string }[]> {
  const names = await resolveNames([...ids]).catch(() => new Map<number, string>());
  return ids.map((id) => ({ id, name: names.get(id) ?? `#${id}` }));
}

/**
 * Starts the removal and queues its one mail (a copy per recipient, paced by the send queue).
 * The 24 hours begin when the first copy goes out; with nobody to mail there is nothing to
 * wait for, so the clock starts at once. A queue that cannot send leaves the removal pending,
 * and the strip offers "I sent the notice" for a mail sent by hand from EVE.
 */
export async function startRemovalAndMail(ctx: RemovalContext): Promise<void> {
  const started = await startFeederRemoval(
    ctx.characterId,
    ctx.corporationId,
    ctx.feederCorporationId
  );
  if (started.recipients.length === 0) {
    await recordFeederRemovalSent(ctx.characterId, ctx.corporationId, ctx.feederCorporationId);
    return;
  }
  await enqueueRemovalMails({
    corporationId: ctx.corporationId,
    feederCorporationId: ctx.feederCorporationId,
    senderCharacterId: ctx.characterId,
    kind: 'removal',
    recipients: await recipientList(started.recipients),
    mail: composeRemovalMail({
      accountingName: ctx.accountingName,
      ownerName: ctx.ownerName,
      officerName: ctx.officerName,
      link: removeNowUrl(window.location.origin, started.code),
    }),
  });
}

/** Cancels the removal and queues the short second mail to the same people. */
export async function cancelRemovalAndMail(ctx: RemovalContext): Promise<void> {
  const { recipients } = await cancelFeederRemoval(
    ctx.characterId,
    ctx.corporationId,
    ctx.feederCorporationId
  );
  if (recipients.length === 0) return;
  await enqueueRemovalMails({
    corporationId: ctx.corporationId,
    feederCorporationId: ctx.feederCorporationId,
    senderCharacterId: ctx.characterId,
    kind: 'removalCancelled',
    recipients: await recipientList(recipients),
    mail: composeRemovalCancelledMail({
      accountingName: ctx.accountingName,
      ownerName: ctx.ownerName,
      officerName: ctx.officerName,
    }),
  });
}
