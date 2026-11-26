import {
  isAlreadyQueued,
  reminderAllowed,
  removalMailsToDrop,
  retryItem,
  stampRemovalEffectiveAt,
  type MailKind,
  type MailQueueItem,
} from '@/engine/corpTaxBook/mailQueue';
import { utcDay } from '@/engine/localDay';
import {
  composeGrantStaleMail,
  composeModeChangeMail,
  composeRateChangeMail,
} from '@/engine/corpTaxBook/ownerRateMail';
import { composePayeeChangeMail } from '@/engine/corpTaxBook/payeeChange';
import type { OwnerRateChange } from '@/engine/corpTaxBook/ownerRate';
import {
  composeLateNoticeMail,
  fillVerifyLink,
  verifyUrl,
  type LateNoticeMailInput,
} from '@/engine/corpTaxBook/lateNoticeMail';
import { db } from '@/db';
import { addToQueue, listQueue, nextOrder, saveItem, saveItems } from './mailQueueStore';

export interface LateNoticeToMail extends Omit<
  LateNoticeMailInput,
  'kind' | 'corporationName' | 'verifyUrl'
> {
  noticeId: string;
  recipientId: number;
  edited?: { subject: string; body: string };
}

export interface EnqueueInput {
  corporationId: number;
  corporationName: string;
  senderCharacterId: number;
  notices: readonly LateNoticeToMail[];
  origin?: string;
}

export interface EnqueueResult {
  batchId: string;
  queued: number;
  skipped: number;
  missingLink: string[];
}

async function buildItems(
  input: EnqueueInput,
  kind: MailKind,
  batchId: string
): Promise<{ items: MailQueueItem[]; missingLink: string[] }> {
  const { readVerifyTokens } = await import('@/features/corp/taxBook/bookClient');
  const tokens = await readVerifyTokens(
    input.senderCharacterId,
    input.corporationId,
    input.notices.map((n) => n.noticeId)
  );
  const origin = input.origin ?? window.location.origin;
  const start = await nextOrder();
  const items: MailQueueItem[] = [];
  const missingLink: string[] = [];
  for (const s of input.notices) {
    const token = tokens.get(s.noticeId);
    if (token === undefined) {
      missingLink.push(s.noticeId);
      continue;
    }
    const link = verifyUrl(origin, token);
    const mail = s.edited
      ? {
          subject: s.edited.subject,
          body: fillVerifyLink(s.edited.body, origin, link),
        }
      : composeLateNoticeMail({
          ...s,
          kind,
          corporationName: input.corporationName,
          verifyUrl: link,
        });
    items.push({
      id: crypto.randomUUID(),
      batchId,
      corporationId: input.corporationId,
      statementId: s.noticeId,
      kind,
      senderCharacterId: input.senderCharacterId,
      recipientId: s.recipientId,
      recipientName: s.recipientName,
      amount: s.amountDue,
      subject: mail.subject,
      body: mail.body,
      order: start + items.length,
      status: 'waiting',
      createdAt: Date.now(),
      attempts: 0,
    });
  }
  return { items, missingLink };
}

export async function enqueueLateNotices(input: EnqueueInput): Promise<EnqueueResult> {
  const batchId = crypto.randomUUID();
  const { items, missingLink } = await buildItems(input, 'notice', batchId);
  const { added, skipped } = await addToQueue(items);
  return { batchId, queued: added.length, skipped: skipped.length, missingLink };
}

export type ReminderResult =
  ({ ok: true } & EnqueueResult) | { ok: false; reason: 'stopped' | 'queued' | 'missingLink' };

export async function enqueueReminder(
  input: Omit<EnqueueInput, 'notices'> & {
    notice: LateNoticeToMail;
    remindersStopped: boolean;
    manualRemindersSent: number;
  }
): Promise<ReminderResult> {
  if (
    !reminderAllowed({
      sent: 0,
      remindersStopped: input.remindersStopped,
      manualSent: input.manualRemindersSent,
    })
  )
    return { ok: false, reason: 'stopped' };
  if (isAlreadyQueued(await listQueue(input.corporationId), input.notice.noticeId, 'reminder'))
    return { ok: false, reason: 'queued' };
  const batchId = crypto.randomUUID();
  const { items, missingLink } = await buildItems(
    { ...input, notices: [input.notice] },
    'reminder',
    batchId
  );
  if (items.length === 0) return { ok: false, reason: 'missingLink' };
  const { editBook } = await import('@/features/corp/taxBook/bookClient');
  await editBook(
    input.senderCharacterId,
    input.corporationId,
    { action: 'recordReminder', statementId: input.notice.noticeId },
    { freshToken: true }
  );
  const { added, skipped } = await addToQueue(items);
  return { ok: true, batchId, queued: added.length, skipped: skipped.length, missingLink };
}

export interface RemovalMailsInput {
  corporationId: number;
  feederCorporationId: number;
  senderCharacterId: number;
  kind: 'removal' | 'removalCancelled';
  recipients: readonly { id: number; name: string; startsClock?: boolean }[];
  mail: { subject: string; body: string };
  removalStartedAt?: number;
}

export async function enqueueRemovalMails(input: RemovalMailsInput): Promise<number> {
  const batchId = crypto.randomUUID();
  const start = await nextOrder();
  const stamp = Date.now();
  const items: MailQueueItem[] = input.recipients.map((r, i) => ({
    id: crypto.randomUUID(),
    batchId,
    corporationId: input.corporationId,
    feederCorporationId: input.feederCorporationId,
    statementId: `${input.kind}:${input.feederCorporationId}:${stamp}:${r.id}`,
    kind: input.kind,
    senderCharacterId: input.senderCharacterId,
    recipientId: r.id,
    recipientName: r.name,
    ...(r.startsClock === undefined ? {} : { startsClock: r.startsClock }),
    ...(input.removalStartedAt === undefined ? {} : { removalStartedAt: input.removalStartedAt }),
    amount: 0,
    subject: input.mail.subject,
    body: input.mail.body,
    order: start + i,
    status: 'waiting',
    createdAt: stamp,
    attempts: 0,
  }));
  const { added } = await addToQueue(items);
  return added.length;
}

export async function dropRemovalMails(
  corporationId: number,
  feederCorporationId: number
): Promise<void> {
  const ids = removalMailsToDrop(await listQueue(), corporationId, feederCorporationId);
  if (ids.length > 0) await db.corpMailQueue.bulkDelete(ids);
}

export async function stampRemovalMails(
  corporationId: number,
  feederCorporationId: number,
  effectiveAt: number
): Promise<void> {
  const stamped = stampRemovalEffectiveAt(
    await listQueue(),
    corporationId,
    feederCorporationId,
    effectiveAt
  );
  if (stamped.length > 0) await saveItems(stamped);
}

export async function retryMail(item: MailQueueItem): Promise<void> {
  await saveItem(retryItem(item, await nextOrder()));
}

async function queueNotices(
  base: Pick<MailQueueItem, 'corporationId' | 'senderCharacterId' | 'kind'> &
    Partial<Pick<MailQueueItem, 'feederCorporationId'>>,
  notices: readonly {
    recipient: { id: number; name: string };
    statementId: string;
    mail: { subject: string; body: string };
  }[]
): Promise<{ queued: number }> {
  const batchId = crypto.randomUUID();
  const start = await nextOrder();
  const items: MailQueueItem[] = notices.map((n, i) => ({
    id: crypto.randomUUID(),
    batchId,
    ...base,
    statementId: n.statementId,
    recipientId: n.recipient.id,
    recipientName: n.recipient.name,
    amount: 0,
    subject: n.mail.subject,
    body: n.mail.body,
    order: start + i,
    status: 'waiting',
    createdAt: Date.now(),
    attempts: 0,
  }));
  const { added } = await addToQueue(items);
  return { queued: added.length };
}

export function enqueueRateChangeMail(input: {
  corporationId: number;
  accountingCorporationName: string;
  senderCharacterId: number;
  feederCorporationId: number;
  change: OwnerRateChange;
  recipients: readonly { id: number; name: string }[];
}): Promise<{ queued: number }> {
  const { change } = input;
  const event = change.recordedAt ?? `${change.date}:${change.newPct}`;
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'rate-change',
    },
    input.recipients.map((r) => ({
      recipient: r,
      statementId: `rate:${input.feederCorporationId}:${event}:${r.id}`,
      mail: composeRateChangeMail({
        accountingCorporationName: input.accountingCorporationName,
        recipientName: r.name,
        change,
      }),
    }))
  );
}

export function enqueueModeChangeMail(input: {
  corporationId: number;
  accountingCorporationName: string;
  senderCharacterId: number;
  feederCorporationId: number;
  mode: 'normal' | 'settled-otherwise';
  at: number;
  recipients: readonly { id: number; name: string }[];
}): Promise<{ queued: number }> {
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'mode-change',
      feederCorporationId: input.feederCorporationId,
    },
    input.recipients.map((r) => ({
      recipient: r,
      statementId: `mode:${input.feederCorporationId}:${input.at}:${r.id}`,
      mail: composeModeChangeMail({
        accountingCorporationName: input.accountingCorporationName,
        recipientName: r.name,
        mode: input.mode,
        date: utcDay(input.at),
      }),
    }))
  );
}

export function enqueueGrantStaleMail(input: {
  corporationId: number;
  accountingCorporationName: string;
  moonOwnerName: string;
  senderCharacterId: number;
  feederCorporationId: number;
  staleSince: number;
  lostOn: string;
  recipients: readonly { id: number; name: string }[];
}): Promise<{ queued: number }> {
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'grant-stale',
      feederCorporationId: input.feederCorporationId,
    },
    input.recipients.map((r) => ({
      recipient: r,
      statementId: `stale:${input.feederCorporationId}:${input.staleSince}:${r.id}`,
      mail: composeGrantStaleMail({
        accountingCorporationName: input.accountingCorporationName,
        moonOwnerName: input.moonOwnerName,
        recipientName: r.name,
        staleSince: utcDay(input.staleSince),
        lostOn: input.lostOn,
      }),
    }))
  );
}

export function enqueuePayeeChangeMail(input: {
  corporationId: number;
  senderCharacterId: number;
  feederCorporationId: number;
  at: number;
  changedByName: string;
  moonOwnerName: string;
  payeeName: string;
  recipients: readonly { id: number; name: string }[];
}): Promise<{ queued: number }> {
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'payee-change',
      feederCorporationId: input.feederCorporationId,
    },
    input.recipients.map((r) => ({
      recipient: r,
      statementId: `payee:${input.feederCorporationId}:${input.at}:${r.id}`,
      mail: composePayeeChangeMail({
        recipientName: r.name,
        changedByName: input.changedByName,
        moonOwnerName: input.moonOwnerName,
        payeeName: input.payeeName,
        date: utcDay(input.at),
      }),
    }))
  );
}

export function enqueueVettingDecisionMail(input: {
  corporationId: number;
  senderCharacterId: number;
  reviewId: string;
  recipient: { id: number; name: string };
  mail: { subject: string; body: string };
}): Promise<{ queued: number }> {
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'vetting-result',
    },
    [
      {
        recipient: input.recipient,
        statementId: `vetting:${input.reviewId}:${input.recipient.id}`,
        mail: input.mail,
      },
    ]
  );
}

export function enqueueVettingRequestMail(input: {
  corporationId: number;
  senderCharacterId: number;
  reviewId: string;
  sentSlot: number;
  recipient: { id: number; name: string };
  mail: { subject: string; body: string };
}): Promise<{ queued: number }> {
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'vetting-request',
    },
    [
      {
        recipient: input.recipient,
        statementId: `vetting-request:${input.reviewId}:${input.recipient.id}:${input.sentSlot}`,
        mail: input.mail,
      },
    ]
  );
}

export function enqueueSrpResultMails(input: {
  corporationId: number;
  senderCharacterId: number;
  kind: 'approved' | 'rejected';
  mails: readonly {
    recipient: { id: number; name: string };
    killmailIds: readonly number[];
    subject: string;
    body: string;
  }[];
}): Promise<{ queued: number }> {
  return queueNotices(
    {
      corporationId: input.corporationId,
      senderCharacterId: input.senderCharacterId,
      kind: 'srp-result',
    },
    input.mails.map((m) => ({
      recipient: m.recipient,
      statementId: `srp:${input.kind}:${[...m.killmailIds].sort((x, y) => x - y).join(',')}:${m.recipient.id}`,
      mail: m,
    }))
  );
}
