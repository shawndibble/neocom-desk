import { MINUTE_MS } from '@/lib/age';

export const MAILS_PER_MINUTE = 5;
export const SEND_GAP_MIN_MS = 12_000;
export const SEND_GAP_MAX_MS = 15_000;
export const OFFLINE_RETRY_MS = 30_000;
const MAX_RATE_LIMIT_WAIT_MS = 10 * MINUTE_MS;

export type MailKind =
  | 'notice'
  | 'reminder'
  | 'rate-change'
  | 'payee-change'
  | 'mode-change'
  | 'grant-stale'
  | 'removal'
  | 'removalCancelled'
  | 'srp-result'
  | 'vetting-result'
  | 'vetting-request';

export const isLateNoticeMail = (kind: string): kind is 'notice' | 'reminder' =>
  kind === 'notice' || kind === 'reminder';
export type MailStatus = 'waiting' | 'sent' | 'failed';
export type MailFailureReason = 'cspa' | 'auth' | 'other';

export interface MailQueueItem {
  id: string;
  batchId: string;
  corporationId: number;
  statementId: string;
  kind: MailKind;
  feederCorporationId?: number;
  startsClock?: boolean;
  effectiveAt?: number;
  removalStartedAt?: number;
  senderCharacterId: number;
  recipientId: number;
  recipientName: string;
  amount: number;
  subject: string;
  body: string;
  order: number;
  status: MailStatus;
  createdAt: number;
  notBefore?: number;
  holdReason?: 'rateLimit' | 'offline';
  sentAt?: number;
  mailId?: number;
  attempts: number;
  failureReason?: MailFailureReason;
  failureDetail?: string;
  logged?: boolean;
}

export { reminderAllowed } from '../../../functions/src/corpTaxBookLateNotice';

export function estimateMinutes(count: number): number {
  return Math.ceil(count / MAILS_PER_MINUTE);
}

export function sendGapMs(random: number): number {
  return Math.round(SEND_GAP_MIN_MS + random * (SEND_GAP_MAX_MS - SEND_GAP_MIN_MS));
}

export type MailFailure =
  | { kind: 'rateLimit'; waitMs: number }
  | { kind: 'offline'; waitMs: number }
  | { kind: 'failed'; reason: MailFailureReason; detail: string };

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

export function retryItem(item: MailQueueItem, order: number): MailQueueItem {
  const next: MailQueueItem = { ...item, status: 'waiting', order };
  delete next.failureReason;
  delete next.failureDetail;
  delete next.notBefore;
  delete next.holdReason;
  return next;
}

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
  percent: number;
  done: boolean;
  minutesLeft: number;
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

export const startsRemovalClock = (item: MailQueueItem): boolean =>
  item.kind === 'removal' && item.startsClock !== false;

const unsentNoticeFor = (item: MailQueueItem, corporationId: number, feeder: number) =>
  item.kind === 'removal' &&
  item.corporationId === corporationId &&
  item.feederCorporationId === feeder &&
  item.status !== 'sent';

export function removalMailsToDrop(
  items: readonly MailQueueItem[],
  corporationId: number,
  feederCorporationId: number
): string[] {
  return items
    .filter((i) => unsentNoticeFor(i, corporationId, feederCorporationId))
    .map((i) => i.id);
}

export function stampRemovalEffectiveAt(
  items: readonly MailQueueItem[],
  corporationId: number,
  feederCorporationId: number,
  effectiveAt: number
): MailQueueItem[] {
  return items
    .filter(
      (i) => unsentNoticeFor(i, corporationId, feederCorporationId) && i.effectiveAt !== effectiveAt
    )
    .map((i) => ({ ...i, effectiveAt }));
}

export interface RemovalNoticeRecord {
  status: string;
  removal?: { startedAt: number };
}

export function removalNoticeStillDue(
  item: MailQueueItem,
  record: RemovalNoticeRecord | undefined
): boolean {
  if (item.kind !== 'removal') return true;
  if (record?.status !== 'pending-removal') return false;
  return item.removalStartedAt === undefined || record.removal?.startedAt === item.removalStartedAt;
}

export function staleMailSpell(
  item: Pick<MailQueueItem, 'kind' | 'statementId'>
): { feederCorporationId: number; staleSince: number } | undefined {
  if (item.kind !== 'grant-stale') return undefined;
  const m = /^stale:(\d+):(\d+):\d+$/.exec(item.statementId);
  return m ? { feederCorporationId: Number(m[1]), staleSince: Number(m[2]) } : undefined;
}
