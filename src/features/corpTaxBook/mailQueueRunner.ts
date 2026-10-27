/**
 * Works through the Corp Tax Book send queue (D16, issue #4064): one mail at a
 * time, 12–15 s apart, holding the whole queue when ESI answers 520
 * MailStopSpamming. The rules live in `engine/corpTaxBook/mailQueue.ts`; this
 * owns the clock, ESI, Dexie and the audit-trail call.
 *
 * `stepQueue` does one thing and says how long to wait before the next;
 * `runMailQueue` loops it under a Web Lock so exactly one tab works the queue
 * (see the scope decision for why that is a lock, not the visibility-gated Tab
 * Leader).
 */
import {
  classifyMailFailure,
  holdQueue,
  markFailed,
  markSent,
  nextStep,
  sendGapMs,
  type MailQueueItem,
} from '@/engine/corpTaxBook/mailQueue';

export interface QueueDeps {
  now(): number;
  random(): number;
  list(): Promise<MailQueueItem[]>;
  save(items: readonly MailQueueItem[]): Promise<void>;
  /** Sends one mail; resolves with ESI's mail id. */
  send(item: MailQueueItem): Promise<number>;
  /** Writes the audit-trail entry for a sent mail. */
  log(item: MailQueueItem): Promise<void>;
  /** Tells the UI which mail is in flight. */
  sending?(id: string | undefined): void;
  /** The request may have reached ESI before it failed (a timeout): never re-send it. */
  isUnconfirmed?(error: unknown): boolean;
  /** Re-checked right before a send (#4621): false drops the mail unsent. */
  isStillDue?(item: MailQueueItem): Promise<boolean>;
  /** Deletes mails that are no longer due. */
  drop?(ids: readonly string[]): Promise<void>;
}

export interface Step {
  /** Wait this long, then step again; null when nothing is left to do. */
  delayMs: number | null;
}

/** Plain `{ status, body }` out of whatever the send threw. */
export function failureShape(
  error: unknown,
  offline: boolean
): Parameters<typeof classifyMailFailure>[0] {
  const e = error as { status?: unknown; body?: unknown; message?: unknown };
  return {
    status: typeof e?.status === 'number' ? e.status : 0,
    body: e?.body,
    message: typeof e?.message === 'string' ? e.message : undefined,
    offline,
  };
}

/** Writes the audit entry for each sent, unlogged mail; true while any could not be written. */
async function logSent(deps: QueueDeps, items: readonly MailQueueItem[]): Promise<boolean> {
  let pending = false;
  for (const item of items) {
    if (item.status !== 'sent' || item.logged || item.mailId === undefined) continue;
    try {
      await deps.log(item);
      await deps.save([{ ...item, logged: true }]);
    } catch {
      // Offline or a stale officer check: the mail is out and is never re-sent;
      // logging is tried again on the next step.
      pending = true;
    }
  }
  return pending;
}

export async function stepQueue(
  deps: QueueDeps,
  isOffline: (error: unknown) => boolean = () => false
): Promise<Step> {
  const items = await deps.list();
  const unlogged = await logSent(deps, items);
  const step = nextStep(items, deps.now());
  if (step.kind === 'idle') {
    return { delayMs: unlogged ? 15_000 : null };
  }
  if (step.kind === 'wait') return { delayMs: Math.max(250, step.until - deps.now()) };

  const { item } = step;
  const settle = async (error: unknown): Promise<Step> => {
    const failure = classifyMailFailure(failureShape(error, isOffline(error)));
    if (failure.kind === 'failed') {
      await deps.save([markFailed(item, failure.reason, failure.detail)]);
      return { delayMs: sendGapMs(deps.random()) };
    }
    // ESI asked us to wait (520) or we are offline: the mail stays waiting.
    await deps.save(
      holdQueue(items, item.senderCharacterId, deps.now() + failure.waitMs, failure.kind)
    );
    return { delayMs: failure.waitMs };
  };
  if (deps.isStillDue && deps.drop) {
    // A check that cannot answer never sends: the mail fails (Retry) or waits for a connection.
    let due: boolean;
    try {
      due = await deps.isStillDue(item);
    } catch (error) {
      return settle(error);
    }
    if (!due) {
      await deps.drop([item.id]);
      return { delayMs: 0 };
    }
  }
  deps.sending?.(item.id);
  try {
    const mailId = await deps.send(item);
    const sent = markSent(item, mailId, deps.now());
    await deps.save([sent]);
    await logSent(deps, [sent]);
    return { delayMs: sendGapMs(deps.random()) };
  } catch (error) {
    if (deps.isUnconfirmed?.(error)) {
      // It may well have been delivered; a second copy would be worse than a Retry.
      await deps.save([
        markFailed(item, 'other', 'The connection timed out; check Sent mail in EVE'),
      ]);
      return { delayMs: sendGapMs(deps.random()) };
    }
    return await settle(error);
  } finally {
    deps.sending?.(undefined);
  }
}

/** Resolves after `ms`, or early (false) if aborted. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    function onAbort() {
      clearTimeout(timer);
      resolve(false);
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface LocksLike {
  request(
    name: string,
    options: { ifAvailable: boolean },
    callback: (lock: unknown) => unknown
  ): Promise<unknown>;
}

export const QUEUE_LOCK = 'neocom:mailQueue';

/**
 * Works the queue until it is idle or aborted. Skips, returning false, if
 * another tab already holds the lock — that tab's loop covers this one.
 */
export async function runMailQueue(
  deps: QueueDeps,
  signal: AbortSignal,
  options: {
    locks?: LocksLike | undefined;
    isOffline?: (error: unknown) => boolean;
    wait?: (ms: number, signal: AbortSignal) => Promise<boolean>;
  } = {}
): Promise<boolean> {
  const wait = options.wait ?? sleep;
  const loop = async () => {
    while (!signal.aborted) {
      const { delayMs } = await stepQueue(deps, options.isOffline);
      if (delayMs === null) return;
      if (!(await wait(delayMs, signal))) return;
    }
  };
  if (!options.locks) {
    await loop();
    return true;
  }
  let ran = false;
  await options.locks.request(QUEUE_LOCK, { ifAvailable: true }, async (lock) => {
    if (!lock) return;
    ran = true;
    await loop();
  });
  return ran;
}
