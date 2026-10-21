/**
 * The Corp Tax Book send queue's rules (D16, issue #4064). Pure: the runner
 * (`features/corpTaxBook/mailQueueRunner.ts`) owns the clock, ESI and Dexie and
 * asks this module what to do next.
 *
 * EVE allows a character about 5 mails a minute and answers beyond that with a
 * 520 MailStopSpamming carrying `remainingTime`. So the queue paces itself at
 * one mail every 12–15 s, and when ESI says wait, holds the whole queue (the
 * mail stays waiting) rather than failing it.
 */

/** ESI's hidden anti-spam limit, mails per minute per character. */
export const MAILS_PER_MINUTE = 5;
export const SEND_GAP_MIN_MS = 12_000;
export const SEND_GAP_MAX_MS = 15_000;
/** How long to hold the queue after a network failure before trying again. */
export const OFFLINE_RETRY_MS = 30_000;
const MAX_RATE_LIMIT_WAIT_MS = 10 * 60_000;

/** `rate-change` (#4515) and `removal`/`removalCancelled` (#4520) are moon owner mails, not Statements. */
export type MailKind = 'statement' | 'reminder' | 'rate-change' | 'removal' | 'removalCancelled';

/** Only Statement mail is logged on a Statement; other kinds have none to log on. */
export const isStatementMail = (kind: MailKind): kind is 'statement' | 'reminder' =>
  kind === 'statement' || kind === 'reminder';
export type MailStatus = 'waiting' | 'sent' | 'failed';
export type MailFailureReason = 'cspa' | 'auth' | 'other';

export interface MailQueueItem {
  id: string;
  /** One "Send N Statements" press. */
  batchId: string;
  corporationId: number;
  statementId: string;
  kind: MailKind;
  /** The moon owner a removal mail is about (#4520); absent on Statement mail. */
  feederCorporationId?: number;
  /** The character the mail is sent from (an officer with the mail scope). */
  senderCharacterId: number;
  recipientId: number;
  recipientName: string;
  /** The Statement's balance, for the queue list. */
  amount: number;
  subject: string;
  body: string;
  /** Queue position: lower goes first. */
  order: number;
  status: MailStatus;
  createdAt: number;
  /** Do not send before this time (ms): set while ESI asks us to wait. */
  notBefore?: number;
  /** Why it is held: ESI said wait, or there was no connection. */
  holdReason?: 'rateLimit' | 'offline';
  sentAt?: number;
  mailId?: number;
  attempts: number;
  failureReason?: MailFailureReason;
  /** The raw message behind a failure, shown under the status. */
  failureDetail?: string;
  /** The audit-trail entry for a sent mail has been written. */
  logged?: boolean;
}

/** Whole minutes (rounded up) `count` mails take at EVE's limit. */
export function estimateMinutes(count: number): number {
  return Math.ceil(count / MAILS_PER_MINUTE);
}

/** The pause after a send, 12–15 s; `random` is a `[0, 1)` draw. */
export function sendGapMs(random: number): number {
  return Math.round(SEND_GAP_MIN_MS + random * (SEND_GAP_MAX_MS - SEND_GAP_MIN_MS));
}

/** D27: an officer's manual reminder to a Miner who opted out is limited to one per Statement. */
export function reminderAllowed(statement: {
  remindersStopped: boolean;
  manualRemindersSent: number;
}): boolean {
  return !statement.remindersStopped || statement.manualRemindersSent < 1;
}

export type MailFailure =
  | { kind: 'rateLimit'; waitMs: number }
  | { kind: 'offline'; waitMs: number }
  | { kind: 'failed'; reason: MailFailureReason; detail: string };

/**
 * What a failed `POST /characters/{id}/mail` means. `remainingTime` is in
 * seconds (esi-issues #504); a value over an hour can only be milliseconds.
 */
export function classifyMailFailure(error: {
  status: number;
  body?: unknown;
  message?: string;
  offline?: boolean;
}): MailFailure {
  if (error.offline) return { kind: 'offline', waitMs: OFFLINE_RETRY_MS };
  const body =
    typeof error.body === 'object' && error.body !== null
      ? (error.body as Record<string, unknown>)
      : {};
  if (error.status === 520) {
    const remaining = Number(body.remainingTime);
    const seconds = Number.isFinite(remaining) && remaining > 0 ? remaining : 60;
    const ms = seconds > 3600 ? seconds : seconds * 1000;
    return { kind: 'rateLimit', waitMs: Math.min(ms + 1000, MAX_RATE_LIMIT_WAIT_MS) };
  }
  const text = [body.error, error.message].filter((v) => typeof v === 'string').join(' ');
  if (error.status === 401 || error.status === 403)
    return { kind: 'failed', reason: 'auth', detail: text };
  if (/cspa|charge|contacts?\s+cost/i.test(text))
    return { kind: 'failed', reason: 'cspa', detail: text };
  return { kind: 'failed', reason: 'other', detail: text };
}

const byOrder = (a: MailQueueItem, b: MailQueueItem) => a.order - b.order;

export function waitingItems(items: readonly MailQueueItem[]): MailQueueItem[] {
  return items.filter((i) => i.status === 'waiting').sort(byOrder);
}

export type NextStep =
  { kind: 'send'; item: MailQueueItem } | { kind: 'wait'; until: number } | { kind: 'idle' };

/**
 * The next mail due, or when to look again. In order, but ESI's limit is per
 * sender: a head held for one sender does not stop another sender's mail.
 */
export function nextStep(items: readonly MailQueueItem[], now: number): NextStep {
  const waiting = waitingItems(items);
  if (waiting.length === 0) return { kind: 'idle' };
  const due = waiting.find((i) => i.notBefore === undefined || i.notBefore <= now);
  if (due) return { kind: 'send', item: due };
  return { kind: 'wait', until: Math.min(...waiting.map((i) => i.notBefore!)) };
}

export function markSent(item: MailQueueItem, mailId: number, at: number): MailQueueItem {
  const next: MailQueueItem = {
    ...item,
    status: 'sent',
    sentAt: at,
    mailId,
    attempts: item.attempts + 1,
  };
  delete next.notBefore;
  delete next.holdReason;
  delete next.failureReason;
  delete next.failureDetail;
  return next;
}

export function markFailed(
  item: MailQueueItem,
  reason: MailFailureReason,
  detail: string
): MailQueueItem {
  return {
    ...item,
    status: 'failed',
    failureReason: reason,
    failureDetail: detail,
    attempts: item.attempts + 1,
  };
}

/** Back to the end of the line for a Retry, with the failure cleared. */
export function retryItem(item: MailQueueItem, order: number): MailQueueItem {
  const next: MailQueueItem = { ...item, status: 'waiting', order };
  delete next.failureReason;
  delete next.failureDetail;
  delete next.notBefore;
  delete next.holdReason;
  return next;
}

/** Hold every waiting mail from `senderCharacterId` until `until` (ESI said wait). */
export function holdQueue(
  items: readonly MailQueueItem[],
  senderCharacterId: number,
  until: number,
  reason: 'rateLimit' | 'offline'
): MailQueueItem[] {
  return items
    .filter((i) => i.status === 'waiting' && i.senderCharacterId === senderCharacterId)
    .map((i) => ({ ...i, notBefore: until, holdReason: reason }));
}

export type DisplayStatus = 'sent' | 'failed' | 'waiting' | 'sending' | 'paused';

/** What a row shows: the head of a held queue is Paused, the rest Waiting. */
export function displayStatus(
  items: readonly MailQueueItem[],
  item: MailQueueItem,
  now: number,
  sendingId?: string
): DisplayStatus {
  if (item.status !== 'waiting') return item.status;
  if (item.id === sendingId) return 'sending';
  const head = waitingItems(items)[0];
  if (head?.id === item.id && item.notBefore !== undefined && item.notBefore > now) return 'paused';
  return 'waiting';
}

export interface QueueSummary {
  total: number;
  sent: number;
  failed: number;
  waiting: number;
  paused: number;
  /** `(sent + failed) / total`, whole percent. */
  percent: number;
  /** Nothing left to send; failures may remain. */
  done: boolean;
  /** Minutes left at EVE's limit; 0 when done. */
  minutesLeft: number;
  /** Seconds until a held queue resumes; 0 when not held. */
  pausedSeconds: number;
}

export function summarize(items: readonly MailQueueItem[], now: number): QueueSummary {
  const total = items.length;
  const sent = items.filter((i) => i.status === 'sent').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const waiting = total - sent - failed;
  const head = waitingItems(items)[0];
  const held = head?.notBefore !== undefined && head.notBefore > now;
  return {
    total,
    sent,
    failed,
    waiting,
    paused: held ? 1 : 0,
    percent: total === 0 ? 0 : Math.round(((sent + failed) / total) * 100),
    done: total > 0 && waiting === 0,
    minutesLeft: estimateMinutes(waiting),
    pausedSeconds: held ? Math.ceil((head.notBefore! - now) / 1000) : 0,
  };
}

/** A Statement already queued (or sent) is not queued twice; a failed one can be retried instead. */
export function isAlreadyQueued(
  items: readonly MailQueueItem[],
  statementId: string,
  kind: MailKind
): boolean {
  return items.some(
    (i) =>
      i.statementId === statementId &&
      i.kind === kind &&
      (kind === 'reminder' ? i.status === 'waiting' : true)
  );
}
