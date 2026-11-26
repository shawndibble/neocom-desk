import { composeRemovalCancelledMail, composeRemovalMail } from '@/engine/corpTaxBook/removalMail';
import { resolveRecipients } from '@/features/corpTaxBook/officerMail';
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
  characterId: number;
  corporationId: number;
  feederCorporationId: number;
  accountingName: string;
  ownerName: string;
  officerName: string;
}

export function removeNowUrl(origin: string, code: string): string {
  return `${origin}/corp-tax-book/remove-now/${code}`;
}

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

export async function startRemovalAndMail(ctx: RemovalContext): Promise<void> {
  const started = await startFeederRemoval(
    ctx.characterId,
    ctx.corporationId,
    ctx.feederCorporationId
  );
  if (started.recipients.length === 0) return;
  const owner = new Set(started.ownerRecipients ?? started.recipients);
  const ordered = [
    ...started.recipients.filter((id) => owner.has(id)),
    ...started.recipients.filter((id) => !owner.has(id)),
  ];
  const recipients = (await resolveRecipients(ordered)).map((r) => ({
    ...r,
    startsClock: owner.has(r.id),
  }));
  await enqueueRemovalMails({
    corporationId: ctx.corporationId,
    feederCorporationId: ctx.feederCorporationId,
    senderCharacterId: ctx.characterId,
    kind: 'removal',
    recipients,
    removalStartedAt: started.startedAt,
    mail: composeRemovalMail({
      accountingName: ctx.accountingName,
      ownerName: ctx.ownerName,
      officerName: ctx.officerName,
      link: removeNowUrl(window.location.origin, started.code),
    }),
  });
}

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
    recipients: await resolveRecipients(recipients),
    mail: composeRemovalCancelledMail({
      accountingName: ctx.accountingName,
      ownerName: ctx.ownerName,
      officerName: ctx.officerName,
    }),
  });
}
