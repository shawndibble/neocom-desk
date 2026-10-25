// pollEveNotifications: the Alerts poller's run loop (issue #3756, ADR 0020).
// Every dependency is injected (store, ESI, FCM), so it tests without Firestore
// or the network; index.ts and alertGrantStore.ts wire the real ones. Selection
// and batching live in eveNotificationSelection.ts / eveNotificationPush.ts.
// Nothing here logs or returns a token.

import { ALERTS_LOCATION_SCOPE, grantCoversNearby, type AlertGrantDoc } from './alertGrant.js';
import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import type { LocationResult } from './esiNearby.js';
import type { NotificationsResult } from './esiNotifications.js';
import { buildPushes, type PushMessage } from './eveNotificationPush.js';
import { selectPushable } from './eveNotificationSelection.js';
import type { NearbyPhaseResult } from './pollNearby.js';
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
  /** Store the grant's scopes without the location one, after ESI refused it (guarded like `patch`). */
  dropLocationScope(characterId: number, guard: string, scopes: string[]): Promise<void>;
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
  /**
   * Nearby alerts (issue #5122, ADR 0027). For a grant that carries the
   * location scope, the same refreshed token reads the Current System; once
   * every grant is done, `runPhase` (pollNearby.ts) pushes what came near.
   * Absent: notifications only.
   */
  nearby?: {
    fetchLocation: (characterId: number, accessToken: string) => Promise<LocationResult>;
    runPhase: (locations: ReadonlyMap<number, number>) => Promise<NearbyPhaseResult>;
  };
}

export interface PollSummary {
  polled: number;
  notModified: number;
  revoked: number;
  skipped: number;
  pushesSent: number;
  /** Characters whose Current System was read for nearby alerts. */
  located: number;
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
    located: 0,
    budgetStopped: false,
  };
  const locations = new Map<number, number>();

  const queue = await deps.store.listActive();
  const worker = async (): Promise<void> => {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      // Skip, never retry: the error budget is shared by every user of the client id.
      if (summary.budgetStopped) {
        summary.skipped++;
        continue;
      }
      try {
        await pollOne(deps, summary, locations, id);
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

  if (deps.nearby && !summary.budgetStopped) {
    try {
      const nearby = await deps.nearby.runPhase(locations);
      summary.pushesSent += nearby.pushesSent;
      if (nearby.budgetStopped) summary.budgetStopped = true;
    } catch (err) {
      deps.log('Nearby alerts phase failed', {
        error: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
  return summary;
}

async function pollOne(
  deps: PollDeps,
  summary: PollSummary,
  locations: Map<number, number>,
  characterId: number
): Promise<void> {
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

  // A 420/429 may have landed while this worker was refreshing: don't add to it.
  if (summary.budgetStopped) {
    summary.skipped++;
    return;
  }
  const grantAlive = await pollNotifications(deps, summary, characterId, accessToken, grant);
  if (!grantAlive || !deps.nearby || !grantCoversNearby(grant) || summary.budgetStopped) return;

  const location = await deps.nearby.fetchLocation(characterId, accessToken);
  switch (location.kind) {
    case 'ok':
      locations.set(characterId, location.solarSystemId);
      summary.located++;
      if (location.budgetLow) summary.budgetStopped = true;
      return;
    case 'backoff':
      summary.budgetStopped = true;
      deps.log('ESI error budget hit; stopping this run', { retryAfterMs: location.retryAfterMs });
      return;
    case 'forbidden':
      // The location scope alone was refused: the notifications still work, so
      // the grant is not revoked. It stops being asked, so a dead scope does
      // not spend the shared error budget every run; the device then sees the
      // Character in no `nearbyGrants` and offers Add nearby again.
      await deps.store.dropLocationScope(
        characterId,
        grant.encryptedRefreshToken,
        (grant.scopes ?? []).filter((scope) => scope !== ALERTS_LOCATION_SCOPE)
      );
      deps.log('ESI refused the location scope (403); nearby alerts off for it', { characterId });
      return;
    default:
      deps.log('ESI location call failed', { characterId, kind: location.kind });
  }
}

/** The grant's notifications; false when the grant turned out dead or the run must stop. */
async function pollNotifications(
  deps: PollDeps,
  summary: PollSummary,
  characterId: number,
  accessToken: string,
  grant: AlertGrantDoc
): Promise<boolean> {
  const { store } = deps;
  const guard = grant.encryptedRefreshToken;
  const result = await deps.fetchNotifications(characterId, accessToken, grant.etag);
  switch (result.kind) {
    case 'not-modified':
      summary.notModified++;
      if (result.budgetLow) summary.budgetStopped = true;
      return true;
    case 'forbidden':
      await store.markRevoked(characterId, guard);
      summary.revoked++;
      deps.log('Alerts Grant rejected by ESI (403)', { characterId });
      return false;
    case 'backoff':
      summary.budgetStopped = true;
      summary.skipped++;
      deps.log('ESI error budget hit; stopping this run', { retryAfterMs: result.retryAfterMs });
      return false;
    case 'error':
      summary.skipped++;
      deps.log('ESI notifications call failed', { characterId, status: result.status });
      return true;
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
    return true;
  }
  await store.patch(characterId, guard, {
    highWaterId: selection.highWaterId,
    etag: result.etag,
    seenTypes: selection.seenTypes,
  });
  return true;
}
