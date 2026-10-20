// pollEveNotifications: the Alerts poller's run loop (issue #3756, ADR 0020).
// Every dependency is injected (store, ESI, FCM), so it tests without Firestore
// or the network; index.ts and alertGrantStore.ts wire the real ones. Selection
// and batching live in eveNotificationSelection.ts / eveNotificationPush.ts.
// Nothing here logs or returns a token.

import type { AlertGrantDoc } from './alertGrant.js';
import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import type { NotificationsResult } from './esiNotifications.js';
import { buildPushes, type PushMessage } from './eveNotificationPush.js';
import { selectPushable } from './eveNotificationSelection.js';
import { suppressPush, type QuietHours } from './quietHours.js';

export const POLL_CONCURRENCY = 5;

export interface PollDevice {
  deviceId: string;
  fcmToken: string;
  /** ESI types this device enabled for the browser channel for the Character. */
  eveTypes: string[];
  /** Quiet time (issue #4566): no pushes inside the window. */
  quietHours?: QuietHours;
}

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string; grant: AlertGrantDoc }
  | { kind: 'revoked' }
  | { kind: 'skip' };

export interface PollerStore {
  /** Characters whose grant is `active`. */
  listActive(): Promise<number[]>;
  /**
   * Refresh the Character's token at SSO and write the rotated one back
   * transactionally. `grant.encryptedRefreshToken` is the stored blob after
   * rotation. `skip`: the grant is no longer active or was replaced meanwhile.
   * `revoked`: SSO answered `invalid_grant`; the store has marked the grant revoked.
   * Other SSO failures throw.
   */
  refresh(characterId: number): Promise<RefreshOutcome>;
  /** `guard` is `grant.encryptedRefreshToken`; a write is dropped if the grant was replaced since. */
  patch(
    characterId: number,
    guard: string,
    state: { highWaterId: number | null; etag: string | null; seenTypes: string[] }
  ): Promise<void>;
  markRevoked(characterId: number, guard: string): Promise<void>;
  devicesFor(characterId: number): Promise<PollDevice[]>;
  deleteDevice(deviceId: string): Promise<void>;
}

export interface PollDeps {
  store: PollerStore;
  fetchNotifications: (
    characterId: number,
    accessToken: string,
    etag: string | null
  ) => Promise<NotificationsResult>;
  send: (token: string, message: PushMessage) => Promise<void>;
  /** Receives only messages and ids — never a token. */
  log: (message: string, data?: Record<string, unknown>) => void;
  concurrency?: number;
  /** Clock, injectable for tests. */
  now?: () => number;
}

export interface PollSummary {
  polled: number;
  notModified: number;
  revoked: number;
  skipped: number;
  pushesSent: number;
  /** True when ESI's shared budget made the run stop early. */
  budgetStopped: boolean;
}

export async function pollEveNotifications(deps: PollDeps): Promise<PollSummary> {
  const summary: PollSummary = {
    polled: 0,
    notModified: 0,
    revoked: 0,
    skipped: 0,
    pushesSent: 0,
    budgetStopped: false,
  };

  const queue = await deps.store.listActive();
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      // Skip, never retry: the error budget is shared by every user of the client id.
      if (summary.budgetStopped) {
        summary.skipped++;
        continue;
      }
      try {
        await pollOne(deps, summary, id);
      } catch (err) {
        summary.skipped++;
        deps.log('Alerts poll failed for a Character', {
          characterId: id,
          error: err instanceof Error ? err.name : 'unknown',
        });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, deps.concurrency ?? POLL_CONCURRENCY) }, worker)
  );
  return summary;
}

async function pollOne(deps: PollDeps, summary: PollSummary, characterId: number): Promise<void> {
  const { store } = deps;

  const refreshed = await store.refresh(characterId);
  if (refreshed.kind === 'revoked') {
    summary.revoked++;
    deps.log('Alerts Grant revoked at SSO', { characterId });
    return;
  }
  if (refreshed.kind === 'skip') {
    summary.skipped++;
    return;
  }
  const { accessToken, grant } = refreshed;
  const guard = grant.encryptedRefreshToken;

  // A 420/429 may have landed while this worker was refreshing: don't add to it.
  if (summary.budgetStopped) {
    summary.skipped++;
    return;
  }
  const result = await deps.fetchNotifications(characterId, accessToken, grant.etag);
  switch (result.kind) {
    case 'not-modified':
      summary.notModified++;
      if (result.budgetLow) summary.budgetStopped = true;
      return;
    case 'forbidden':
      await store.markRevoked(characterId, guard);
      summary.revoked++;
      deps.log('Alerts Grant rejected by ESI (403)', { characterId });
      return;
    case 'backoff':
      summary.budgetStopped = true;
      summary.skipped++;
      deps.log('ESI error budget hit; stopping this run', { retryAfterMs: result.retryAfterMs });
      return;
    case 'error':
      summary.skipped++;
      deps.log('ESI notifications call failed', { characterId, status: result.status });
      return;
    case 'ok':
      break;
  }

  summary.polled++;
  if (result.budgetLow) summary.budgetStopped = true;

  const devices = await store.devicesFor(characterId);
  const selection = selectPushable({
    notifications: result.notifications,
    highWaterId: grant.highWaterId,
    enabledAt: grant.enabledAt,
    seenTypes: grant.seenTypes,
    devices,
  });

  // Send first, then advance the high-water mark: a crash in between repeats a
  // push (the client dedupes on Occurrence Key) instead of losing one.
  let transientFailure = false;
  for (const device of devices) {
    // Quiet time: skipped, not queued. The high-water mark still advances below,
    // and the Alerts list gets the notification through the feed sync.
    const nowMs = (deps.now ?? Date.now)();
    const pushable = selection.byDevice
      .get(device.deviceId)
      ?.filter((n) => !suppressPush(nowMs, device.quietHours, n.type));
    if (!pushable || pushable.length === 0) continue;
    for (const message of buildPushes(characterId, pushable)) {
      try {
        await deps.send(device.fcmToken, message);
        summary.pushesSent++;
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String(err.code) : '';
        const text = err instanceof Error ? err.message : '';
        if (shouldDeleteDeviceToken(code, text)) {
          await store.deleteDevice(device.deviceId);
          break;
        }
        transientFailure = true;
        deps.log('Alerts push failed', { deviceId: device.deviceId, error: code || 'unknown' });
      }
    }
  }

  // A transient send failure leaves the state (and ETag, which would otherwise
  // answer 304) untouched so the next poll retries; devices that did receive
  // the push get it again, which the client dedupes on Occurrence Key.
  if (transientFailure) {
    summary.skipped++;
    return;
  }
  await store.patch(characterId, guard, {
    highWaterId: selection.highWaterId,
    etag: result.etag,
    seenTypes: selection.seenTypes,
  });
}
