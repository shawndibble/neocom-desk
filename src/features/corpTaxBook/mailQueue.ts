/**
 * The Corp Tax Book send queue's public API (issue #4064). The Statements tab
 * (#4063) calls `enqueueStatements` when the officer presses Send; everything
 * after that (pacing, 520 waits, survival across tabs, the audit log) is the
 * queue's own business.
 */
import {
  isAlreadyQueued,
  reminderAllowed,
  removalMailsToDrop,
  retryItem,
  stampRemovalEffectiveAt,
  type MailKind,
  type MailQueueItem,
} from '@/engine/corpTaxBook/mailQueue';
import { composeRateChangeMail } from '@/engine/corpTaxBook/ownerRateMail';
import { composePayeeChangeMail } from '@/engine/corpTaxBook/payeeChange';
import type { OwnerRateChange } from '@/engine/corpTaxBook/ownerRate';
import { composeStatementMail, type StatementMailInput } from '@/engine/corpTaxBook/statementMail';
import { db } from '@/db';
import { addToQueue, listQueue, nextOrder, saveItem, saveItems } from './mailQueueStore';

/** What the queue needs to mail one Miner their Statement. */
export interface StatementToMail extends Omit<
  StatementMailInput,
  'kind' | 'corporationName' | 'refineryName' | 'verifyUrl'
> {
  statementId: string;
  /** The Miner's main character, who gets the mail. */
  recipientId: number;
  /** Balance due, shown on the queue row. */
  amountDue: number;
}

export interface EnqueueInput {
  corporationId: number;
  corporationName: string;
  /** The officer's character the mail goes from. */
  senderCharacterId: number;
  statements: readonly StatementToMail[];
  refineryName: StatementMailInput['refineryName'];
  /** Where the app is served, for the verify link. Defaults to this origin. */
  origin?: string;
}

export interface EnqueueResult {
  batchId: string;
  queued: number;
  /** Already in the queue (or already sent): not queued again. */
  skipped: number;
  /** Statements with no verify link in the book: not queued. */
  missingLink: string[];
}

async function buildItems(
  input: EnqueueInput,
  kind: MailKind,
  batchId: string
): Promise<{ items: MailQueueItem[]; missingLink: string[] }> {
  const { readVerifyTokens, verifyUrl } = await import('@/features/corp/taxBook/bookClient');
  const tokens = await readVerifyTokens(
    input.senderCharacterId,
    input.corporationId,
    input.statements.map((s) => s.statementId)
  );
  const origin = input.origin ?? window.location.origin;
  const start = await nextOrder();
  const items: MailQueueItem[] = [];
  const missingLink: string[] = [];
  for (const s of input.statements) {
    const token = tokens.get(s.statementId);
    if (token === undefined) {
      missingLink.push(s.statementId);
      continue;
    }
    const mail = composeStatementMail({
      ...s,
      kind,
      corporationName: input.corporationName,
      refineryName: input.refineryName,
      verifyUrl: verifyUrl(origin, token),
    });
    items.push({
      id: crypto.randomUUID(),
      batchId,
      corporationId: input.corporationId,
      statementId: s.statementId,
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

/** Queues one Statement mail per Miner. A Statement already queued or sent is skipped. */
export async function enqueueStatements(input: EnqueueInput): Promise<EnqueueResult> {
  const batchId = crypto.randomUUID();
  const { items, missingLink } = await buildItems(input, 'statement', batchId);
  const { added, skipped } = await addToQueue(items);
  return { batchId, queued: added.length, skipped: skipped.length, missingLink };
}

export type ReminderResult =
  ({ ok: true } & EnqueueResult) | { ok: false; reason: 'stopped' | 'queued' | 'missingLink' };

/**
 * Queues one manual reminder for a Statement (D19: reminders are manual). A
 * Miner who chose "Stop reminders" (D27) gets one per Statement: the book
 * counts it before the mail is queued and refuses the next.
 */
export async function enqueueReminder(
  input: Omit<EnqueueInput, 'statements'> & {
    statement: StatementToMail;
    remindersStopped: boolean;
    manualRemindersSent: number;
  }
): Promise<ReminderResult> {
  if (!reminderAllowed(input)) return { ok: false, reason: 'stopped' };
  if (
    isAlreadyQueued(await listQueue(input.corporationId), input.statement.statementId, 'reminder')
  )
    return { ok: false, reason: 'queued' };
  const batchId = crypto.randomUUID();
  const { items, missingLink } = await buildItems(
    { ...input, statements: [input.statement] },
    'reminder',
    batchId
  );
  if (items.length === 0) return { ok: false, reason: 'missingLink' };
  // Counted in the book first: the server is the one that enforces D27.
  const { editBook } = await import('@/features/corp/taxBook/bookClient');
  await editBook(
    input.senderCharacterId,
    input.corporationId,
    {
      action: 'recordReminder',
      statementId: input.statement.statementId,
    },
    { freshToken: true }
  );
  const { added, skipped } = await addToQueue(items);
  return { ok: true, batchId, queued: added.length, skipped: skipped.length, missingLink };
}

export interface RemovalMailsInput {
  corporationId: number;
  feederCorporationId: number;
  /** The officer's character the mail goes from. */
  senderCharacterId: number;
  kind: 'removal' | 'removalCancelled';
  /** `startsClock`: a copy to the moon owner's CEO or payee (a removal notice only). */
  recipients: readonly { id: number; name: string; startsClock?: boolean }[];
  mail: { subject: string; body: string };
  /** The removal a notice belongs to (`startedAt`); the queue re-checks it before sending (#4621). */
  removalStartedAt?: number;
}

/**
 * Queues the removal notice (or its cancellation) once per recipient. The queue sends them
 * paced like any other mail; the first copy to the moon owner side starts the removal's 24 hours.
 */
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

/** A cancelled removal: its notices still waiting (or failed, awaiting Retry) never go out. */
export async function dropRemovalMails(
  corporationId: number,
  feederCorporationId: number
): Promise<void> {
  const ids = removalMailsToDrop(await listQueue(), corporationId, feederCorporationId);
  if (ids.length > 0) await db.corpMailQueue.bulkDelete(ids);
}

/** The removal's clock started: every copy still to send states that recorded time. */
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

/** Puts a failed mail back at the end of the line. */
export async function retryMail(item: MailQueueItem): Promise<void> {
  await saveItem(retryItem(item, await nextOrder()));
}

/**
 * Queues the short "your rate changed" mail, one per recipient. Never throws
 * into the rate change: the caller has already saved it. A mail already queued
 * for the same change and recipient is not queued twice.
 */
export async function enqueueRateChangeMail(input: {
  corporationId: number;
  accountingCorporationName: string;
  senderCharacterId: number;
  feederCorporationId: number;
  change: OwnerRateChange;
  recipients: readonly { id: number; name: string }[];
}): Promise<{ queued: number }> {
  const batchId = crypto.randomUUID();
  const start = await nextOrder();
  // The change is the edit that made it: 8% → 6% → 8% on one day is three mails, not two.
  const { change } = input;
  const event = change.recordedAt ?? `${change.date}:${change.newPct}`;
  const items: MailQueueItem[] = input.recipients.map((r, i) => {
    const mail = composeRateChangeMail({
      accountingCorporationName: input.accountingCorporationName,
      recipientName: r.name,
      change: input.change,
    });
    return {
      id: crypto.randomUUID(),
      batchId,
      corporationId: input.corporationId,
      statementId: `rate:${input.feederCorporationId}:${event}:${r.id}`,
      kind: 'rate-change',
      senderCharacterId: input.senderCharacterId,
      recipientId: r.id,
      recipientName: r.name,
      amount: 0,
      subject: mail.subject,
      body: mail.body,
      order: start + i,
      status: 'waiting',
      createdAt: Date.now(),
      attempts: 0,
    };
  });
  const { added } = await addToQueue(items);
  return { queued: added.length };
}

/**
 * Queues the short "payments now go to" mail (#4653), one per recipient. Never throws into the
 * payee change: the caller has already saved it. One change (`at`) is mailed once per recipient.
 */
export async function enqueuePayeeChangeMail(input: {
  corporationId: number;
  senderCharacterId: number;
  feederCorporationId: number;
  /** When the change was made (ms): one mail per change and recipient. */
  at: number;
  /** UTC day of the change. */
  date: string;
  changedByName: string;
  moonOwnerName: string;
  payeeName: string;
  recipients: readonly { id: number; name: string }[];
}): Promise<{ queued: number }> {
  const batchId = crypto.randomUUID();
  const start = await nextOrder();
  const items: MailQueueItem[] = input.recipients.map((r, i) => {
    const mail = composePayeeChangeMail({
      recipientName: r.name,
      changedByName: input.changedByName,
      moonOwnerName: input.moonOwnerName,
      payeeName: input.payeeName,
      date: input.date,
    });
    return {
      id: crypto.randomUUID(),
      batchId,
      corporationId: input.corporationId,
      feederCorporationId: input.feederCorporationId,
      statementId: `payee:${input.feederCorporationId}:${input.at}:${r.id}`,
      kind: 'payee-change',
      senderCharacterId: input.senderCharacterId,
      recipientId: r.id,
      recipientName: r.name,
      amount: 0,
      subject: mail.subject,
      body: mail.body,
      order: start + i,
      status: 'waiting',
      createdAt: Date.now(),
      attempts: 0,
    };
  });
  const { added } = await addToQueue(items);
  return { queued: added.length };
}
