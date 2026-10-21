import { composeRemovalCancelledMail, composeRemovalMail } from '@/engine/corpTaxBook/removalMail';
import { resolveNames } from '@/features/character/names';
import {
  dropRemovalMails,
  enqueueRemovalMails,
  stampRemovalMails,
} from '@/features/corpTaxBook/mailQueue';
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
 * The notice went out (a queued copy to the moon owner side, or "I sent the notice"): records
 * it, then makes every copy still to send state the recorded time.
 */
export async function recordRemovalNoticeSent(
  characterId: number,
  corporationId: number,
  feederCorporationId: number,
  sentAt?: number
): Promise<void> {
  const { effectiveAt } = await recordFeederRemovalSent(
    characterId,
    corporationId,
    feederCorporationId,
    sentAt
  );
  if (effectiveAt !== null)
    await stampRemovalMails(corporationId, feederCorporationId, effectiveAt);
}

/**
 * Starts the removal and queues its one mail (a copy per recipient, paced by the send queue).
 * The 24 hours begin when a copy to the moon owner's CEO or payee goes out, so those go first;
 * the accounting corporation's own copies never start it (#4617). When no moon owner side
 * copy can go out, or nobody at all is left to mail, the removal stays pending and the strip
 * offers "I sent the notice" for a mail sent by hand from EVE.
 */
export async function startRemovalAndMail(ctx: RemovalContext): Promise<void> {
  const started = await startFeederRemoval(
    ctx.characterId,
    ctx.corporationId,
    ctx.feederCorporationId
  );
  if (started.recipients.length === 0) return;
  // A server without the split: every copy starts the clock, as before.
  const owner = new Set(started.ownerRecipients ?? started.recipients);
  const ordered = [
    ...started.recipients.filter((id) => owner.has(id)),
    ...started.recipients.filter((id) => !owner.has(id)),
  ];
  const recipients = (await recipientList(ordered)).map((r) => ({
    ...r,
    startsClock: owner.has(r.id),
  }));
  await enqueueRemovalMails({
    corporationId: ctx.corporationId,
    feederCorporationId: ctx.feederCorporationId,
    senderCharacterId: ctx.characterId,
    kind: 'removal',
    recipients,
    mail: composeRemovalMail({
      accountingName: ctx.accountingName,
      ownerName: ctx.ownerName,
      officerName: ctx.officerName,
      link: removeNowUrl(window.location.origin, started.code),
    }),
  });
}

/**
 * Cancels the removal, drops its notices still waiting to go out (#4617), and queues the short
 * second mail to the same people.
 */
export async function cancelRemovalAndMail(ctx: RemovalContext): Promise<void> {
  const { recipients } = await cancelFeederRemoval(
    ctx.characterId,
    ctx.corporationId,
    ctx.feederCorporationId
  );
  await dropRemovalMails(ctx.corporationId, ctx.feederCorporationId);
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
