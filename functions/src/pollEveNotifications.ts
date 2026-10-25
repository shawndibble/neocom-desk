// pollEveNotifications: the Alerts poller's run loop (issue #3756, ADR 0020).
// Every dependency is injected (store, ESI, FCM), so it tests without Firestore
// or the network; index.ts and alertGrantStore.ts wire the real ones. Selection
// and batching live in eveNotificationSelection.ts / eveNotificationPush.ts.
// Nothing here logs or returns a token.

import {
  ALERTS_LOCATION_SCOPE,
  ALERTS_MAIL_SCOPE,
  grantCoversMail,
  grantCoversNearby,
  type AlertGrantDoc,
} from './alertGrant.js';
import { shouldDeleteDeviceToken } from './dispatchProjections.js';
import type { LocationResult } from './esiNearby.js';
import type { MailHeadersResult } from './esiMail.js';
import type { NotificationsResult } from './esiNotifications.js';
import { buildPushes, type PushMessage } from './eveNotificationPush.js';
import { selectPushable } from './eveNotificationSelection.js';
import { MAX_MAIL_PUSHES, buildMailPush, mailPushedEntry, selectNewMail } from './mailPush.js';
import type { NearbyPhaseResult } from './pollNearby.js';
import { suppressPush, type QuietHours } from './quietHours.js';

export const POLL_CONCURRENCY = 5;

export interface PollDevice {
  deviceId: string;
  fcmToken: string;
  /** ESI types this device enabled for the browser channel for the Character. */
  eveTypes: string[];
  /** The server-pushed event ids this device enabled for the Character (`newMail` is read here). */
  serverEvents?: string[];
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
  /** New-mail state (ADR 0029), guarded like `patch`. Ids and an ETag only, never mail content. */
  patchMail(
    characterId: number,
    guard: string,
    state: { mailHighWaterId: number | null; mailEtag: string | null; mailPushed: string[] }
  ): Promise<void>;
  /** Store the grant's scopes without the mail one, after ESI refused it, and forget its mail state (guarded like `patch`). */
  dropMailScope(characterId: number, guard: string, scopes: string[]): Promise<void>;
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
   * New-mail alerts (issue #5143, ADR 0029). For a grant that carries the mail
   * scope and a device that wants `newMail`, the same refreshed token reads the
   * mail HEADERS and the run pushes what is new. Absent: no mail is read.
   */
  mail?: {
    fetchHeaders: (
      characterId: number,
      accessToken: string,
      etag: string | null
    ) => Promise<MailHeadersResult>;
  };
  /**
   * Nearby alerts (issue #5122, ADR 0028). For a grant that carries the
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
  // The Character's devices, read at most once however many of the reads below want them.
  let devicesRead: Promise<PollDevice[]> | undefined;
  const devices = () => (devicesRead ??= store.devicesFor(characterId));
  const grantAlive = await pollNotifications(
    deps,
    summary,
    characterId,
    accessToken,
    grant,
    devices
  );
  if (!grantAlive) return;
  await pollMailSafely(deps, summary, characterId, accessToken, grant, devices);
  if (!deps.nearby || !grantCoversNearby(grant) || summary.budgetStopped) return;

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
  grant: AlertGrantDoc,
  readDevices: () => Promise<PollDevice[]>
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

  const devices = await readDevices();
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

/** One Character's mail must never cost it its nearby read, or the run its other Characters. */
async function pollMailSafely(
  deps: PollDeps,
  summary: PollSummary,
  characterId: number,
  accessToken: string,
  grant: AlertGrantDoc,
  readDevices: () => Promise<PollDevice[]>
): Promise<void> {
  try {
    await pollMail(deps, summary, characterId, accessToken, grant, readDevices);
  } catch (err) {
    deps.log('Mail alerts failed for a Character', {
      characterId,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

/**
 * New-mail alerts (ADR 0029): the grant's mail HEADERS, pushed to each device
 * that enabled `newMail` for the Character. Edge semantics are `diffNewMail`'s
 * (mailCalendar.ts): a mark seeds silently, then every id above it not sent by
 * the Character itself is new. Only ids are kept — never a sender or a subject.
 */
async function pollMail(
  deps: PollDeps,
  summary: PollSummary,
  characterId: number,
  accessToken: string,
  grant: AlertGrantDoc,
  readDevices: () => Promise<PollDevice[]>
): Promise<void> {
  if (!deps.mail || !grantCoversMail(grant) || summary.budgetStopped) return;
  const { store } = deps;
  const guard = grant.encryptedRefreshToken;
  const wanting = (await readDevices()).filter((d) => d.serverEvents?.includes('newMail'));

  if (wanting.length === 0) {
    // Nobody wants it: read nothing, and forget the mark, so turning it on again
    // seeds afresh instead of announcing everything that arrived meanwhile.
    if (grant.mailHighWaterId != null || grant.mailEtag != null) {
      await store.patchMail(characterId, guard, {
        mailHighWaterId: null,
        mailEtag: null,
        mailPushed: [],
      });
    }
    return;
  }

  const seeded = grant.mailHighWaterId != null;
  const result = await deps.mail.fetchHeaders(
    characterId,
    accessToken,
    seeded ? (grant.mailEtag ?? null) : null
  );
  switch (result.kind) {
    case 'not-modified':
      if (result.budgetLow) summary.budgetStopped = true;
      return;
    case 'forbidden':
      // The mail scope alone was refused: notifications still work, so the grant
      // is not revoked. It stops being asked, so a dead scope does not spend the
      // shared error budget every run, and Settings offers Add mail again.
      await store.dropMailScope(
        characterId,
        guard,
        (grant.scopes ?? []).filter((scope) => scope !== ALERTS_MAIL_SCOPE)
      );
      deps.log('ESI refused the mail scope (403); mail alerts off for it', { characterId });
      return;
    case 'backoff':
      summary.budgetStopped = true;
      deps.log('ESI error budget hit; stopping this run', { retryAfterMs: result.retryAfterMs });
      return;
    case 'error':
      deps.log('ESI mail call failed', { characterId, status: result.status });
      return;
    case 'ok':
      break;
  }
  if (result.budgetLow) summary.budgetStopped = true;

  const selection = selectNewMail(characterId, grant.mailHighWaterId ?? null, result.headers);
  const alreadyPushed = new Set(grant.mailPushed ?? []);
  const pushedNow: string[] = [];
  let transientFailure = false;
  // A burst pushes only its newest mails; the Alerts list gets the rest when the app opens.
  const fires = selection.fires.slice(-MAX_MAIL_PUSHES);
  const nowMs = (deps.now ?? Date.now)();
  for (const device of wanting) {
    // Quiet time: skipped, not queued. The mark still advances below.
    if (suppressPush(nowMs, device.quietHours, undefined)) continue;
    for (const fire of fires) {
      const entry = mailPushedEntry(device.deviceId, fire);
      if (alreadyPushed.has(entry)) continue;
      try {
        await deps.send(device.fcmToken, buildMailPush(fire, nowMs));
        summary.pushesSent++;
        pushedNow.push(entry);
      } catch (err) {
        const code = err instanceof Error && 'code' in err ? String(err.code) : '';
        const text = err instanceof Error ? err.message : '';
        if (shouldDeleteDeviceToken(code, text)) {
          await store.deleteDevice(device.deviceId);
          break;
        }
        transientFailure = true;
        deps.log('Mail push failed', { deviceId: device.deviceId, error: code || 'unknown' });
      }
    }
  }

  // A transient failure leaves the mark (and the ETag, which would otherwise
  // answer 304) where it was, so the next run retries; what already went out is
  // logged so it is not sent twice. Otherwise the mark advances past everything
  // and the log is empty, since nothing at or below the mark can come back.
  await store.patchMail(
    characterId,
    guard,
    transientFailure
      ? {
          mailHighWaterId: grant.mailHighWaterId ?? null,
          mailEtag: grant.mailEtag ?? null,
          mailPushed: [...alreadyPushed, ...pushedNow],
        }
      : { mailHighWaterId: selection.highWaterId, mailEtag: result.etag, mailPushed: [] }
  );
  if (transientFailure) summary.skipped++;
}
