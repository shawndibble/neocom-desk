// pollEveNotifications: the Alerts poller's run loop (issue #3756, ADR 0020).
// Every dependency is injected (store, ESI, FCM), so it tests without Firestore
// or the network; index.ts and alertGrantStore.ts wire the real ones. Selection
// and batching live in eveNotificationSelection.ts / eveNotificationPush.ts.
// Nothing here logs or returns a token.

import { SsoRefreshError, type AlertGrantDoc } from './alertGrant.js';
import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import type { NotificationsResult } from './esiNotifications.js';
import { buildPushes, type PushMessage } from './eveNotificationPush.js';
import { selectPushable } from './eveNotificationSelection.js';

export const POLL_CONCURRENCY = 5;

export interface PollDevice {
  deviceId: string;
  fcmToken: string;
  /** ESI types this device enabled for the browser channel for the Character. */
  eveTypes: string[];
}

export interface PollerStore {
  /** Characters whose grant is `active`. */
  listActive(): Promise<number[]>;
  /**
   * Refresh the Character's token at SSO and write the rotated one back in the
   * same transaction that read it. Null when the grant is no longer active.
   * Throws `SsoRefreshError` when SSO refuses.
   */
  refresh(characterId: number): Promise<{ accessToken: string; grant: AlertGrantDoc } | null>;
  patch(
    characterId: number,
    state: { highWaterId: number | null; etag: string | null; seenTypes: string[] }
  ): Promise<void>;
  markRevoked(characterId: number): Promise<void>;
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

  let refreshed: Awaited<ReturnType<PollerStore['refresh']>>;
  try {
    refreshed = await store.refresh(characterId);
  } catch (err) {
    if (err instanceof SsoRefreshError && err.invalidGrant) {
      await store.markRevoked(characterId);
      summary.revoked++;
      deps.log('Alerts Grant revoked at SSO', { characterId });
      return;
    }
    throw err;
  }
  if (!refreshed) {
    summary.skipped++;
    return;
  }
  const { accessToken, grant } = refreshed;

  const result = await deps.fetchNotifications(characterId, accessToken, grant.etag);
  switch (result.kind) {
    case 'not-modified':
      summary.notModified++;
      if (result.budgetLow) summary.budgetStopped = true;
      return;
    case 'forbidden':
      await store.markRevoked(characterId);
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
    devices: devices.map((d) => ({ deviceId: d.deviceId, eveTypes: d.eveTypes })),
  });

  // Send first, then advance the high-water mark: a crash in between repeats a
  // push (the client dedupes on Occurrence Key) instead of losing one.
  for (const device of devices) {
    const pushable = selection.byDevice.get(device.deviceId);
    if (!pushable) continue;
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
        deps.log('Alerts push failed', { deviceId: device.deviceId, error: code || 'unknown' });
      }
    }
  }

  await store.patch(characterId, {
    highWaterId: selection.highWaterId,
    etag: result.etag,
    seenTypes: selection.seenTypes,
  });
}
