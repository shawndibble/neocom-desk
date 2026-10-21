/**
 * The Corp Tax Book send queue's public API (issue #4064). The Statements tab
 * (#4063) calls `enqueueStatements` when the officer presses Send; everything
 * after that (pacing, 520 waits, survival across tabs, the audit log) is the
 * queue's own business.
 */
import {
  isAlreadyQueued,
  reminderAllowed,
  retryItem,
  type MailKind,
  type MailQueueItem,
} from '@/engine/corpTaxBook/mailQueue';
import { composeRateChangeMail } from '@/engine/corpTaxBook/ownerRateMail';
import type { OwnerRateChange } from '@/engine/corpTaxBook/ownerRate';
import { composeStatementMail, type StatementMailInput } from '@/engine/corpTaxBook/statementMail';
import { addToQueue, listQueue, nextOrder, saveItem } from './mailQueueStore';

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
      statementId: `rate:${input.feederCorporationId}:${input.change.date}:${input.change.newPct}:${r.id}`,
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
