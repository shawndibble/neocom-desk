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
import { NO_ORIGIN_SYSTEM } from './pollNearby.js';
import {
  deviceCadence,
  liveDevices,
  planGrant,
  wakeCutoffMs,
  type GrantPlan,
} from './pollerEfficiency.js';
import { ALERTS_POLL_STATS_KEYS, createRunStats, type RunStats } from './runStats.js';
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
  /** When the registration doc was last written (the open app re-registers hourly); absent on old docs. */
  updatedAtMs?: number | null;
}

/** An active grant as the listing read it, so planning needs no second read. */
export interface ListedGrant {
  characterId: number;
  grant: AlertGrantDoc;
}

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string; grant: AlertGrantDoc }
  | { kind: 'revoked' }
  | { kind: 'skip' };

export interface PollerStore {
  /** Every `active` grant (the listing already reads each in full). */
  listActive(): Promise<ListedGrant[]>;
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
    state: {
      highWaterId: number | null;
      etag: string | null;
      seenTypes: string[];
      /** Written as `false` by the first read after the grant was marked idle. */
      notificationsIdle?: false;
    }
  ): Promise<void>;
  /**
   * Nobody live wants this any more (issue #5144): mark the notifications idle so
   * the next read resumes instead of replaying, and/or forget the mail mark
   * (guarded like `patch`). Both are the "enabling never replays" half of
   * skipping the reads.
   */
  markIdle(
    characterId: number,
    guard: string,
    what: { notifications: boolean; clearMail: boolean }
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
  /** Registered devices by Character, one read for the whole run. */
  devicesForMany(characterIds: number[]): Promise<Map<number, PollDevice[]>>;
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
  /** The run's counters (issue #5144); the store and ESI wrappers share it. Absent: counted privately. */
  stats?: RunStats;
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
    /**
     * Whether any list a wanting device reads has an entry this run (issue
     * #5144). False (every wanted list read, all empty): no Character's
     * location is read. The lists are read once per run and shared with `runPhase`.
     */
    hasCandidates?: (wanted: { incursions: boolean; skyhooks: boolean }) => Promise<boolean>;
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

interface RunContext {
  deps: PollDeps;
  summary: PollSummary;
  stats: RunStats;
  locations: Map<number, number>;
  nowMs: number;
  /** Read at most once, by the first grant that wants a location. */
  candidates?: Promise<boolean>;
  wantedLists: { incursions: boolean; skyhooks: boolean };
}

/** One grant with the devices holding its Character and what the run will do with it. */
interface PlannedGrant {
  characterId: number;
  grant: AlertGrantDoc;
  devices: PollDevice[];
  plan: GrantPlan;
}

export async function pollEveNotifications(deps: PollDeps): Promise<PollSummary> {
  const clock = deps.now ?? Date.now;
  const startedAt = clock();
  const stats = deps.stats ?? createRunStats(ALERTS_POLL_STATS_KEYS);
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

  const listed = await deps.store.listActive();
  stats.set('grantsListed', listed.length);
  const devicesByCharacter =
    listed.length > 0
      ? await deps.store.devicesForMany(listed.map((l) => l.characterId))
      : new Map<number, PollDevice[]>();
  const wantedLists = { incursions: false, skyhooks: false };
  const seenDevices = new Set<string>();
  const sleepingDevices = new Set<string>();
  const dormantDevices = new Set<string>();
  const queue: PlannedGrant[] = [];
  for (const { characterId, grant } of listed) {
    const devices = devicesByCharacter.get(characterId) ?? [];
    for (const d of devices) {
      seenDevices.add(d.deviceId);
      const cadence = deviceCadence(d.updatedAtMs, startedAt);
      if (cadence === 'sleeping') sleepingDevices.add(d.deviceId);
      if (cadence === 'dormant') dormantDevices.add(d.deviceId);
    }
    const plan = planGrant(grant, devices, startedAt);
    if (plan.action === 'backoff') {
      stats.add('grantsSkippedDeviceBackoff');
      continue;
    }
    queue.push({ characterId, grant, devices, plan });
    if (plan.action === 'poll' && plan.call.nearby) {
      // Every live device counts, asleep or not: the origin handed to a Character
      // whose location is skipped must only stand where no list it reads has an entry.
      for (const d of liveDevices(devices, startedAt)) {
        if (d.serverEvents?.includes('incursionNearby')) wantedLists.incursions = true;
        if (d.serverEvents?.includes('skyhookRaidableNearby')) wantedLists.skyhooks = true;
      }
    }
  }
  stats.set('devicesRead', seenDevices.size);
  stats.set('devicesSleeping', sleepingDevices.size);
  stats.set('devicesDormant', dormantDevices.size);
  const ctx: RunContext = { deps, summary, stats, locations, nowMs: startedAt, wantedLists };

  const worker = async (): Promise<void> => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) {
      try {
        if (item.plan.action === 'idle') {
          // No refresh and no ESI call: only the once-off write that makes waking safe.
          stats.add('grantsSkippedIdle');
          await markIdle(ctx, item);
          continue;
        }
        // Skip, never retry: the error budget is shared by every user of the client id.
        if (summary.budgetStopped) {
          summary.skipped++;
          stats.add('grantsSkippedBudget');
          continue;
        }
        await pollOne(ctx, item);
      } catch (err) {
        summary.skipped++;
        stats.add('grantsSkippedError');
        deps.log('Alerts poll failed for a Character', {
          characterId: item.characterId,
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
  stats.set('durationMs', clock() - startedAt);
  return summary;
}

/** An idle grant's state: notifications marked idle, the mail mark forgotten. One write, once. */
async function markIdle(ctx: RunContext, item: PlannedGrant): Promise<void> {
  const { grant, characterId } = item;
  const notifications = item.plan.idle.notifications && grant.notificationsIdle !== true;
  const clearMail =
    item.plan.idle.mail && (grant.mailHighWaterId != null || grant.mailEtag != null);
  if (!notifications && !clearMail) return;
  await ctx.deps.store.markIdle(characterId, grant.encryptedRefreshToken, {
    notifications,
    clearMail,
  });
  ctx.stats.add('idleStateWrites');
}

async function pollOne(ctx: RunContext, item: PlannedGrant): Promise<void> {
  const { deps, summary, stats, locations } = ctx;
  const { store } = deps;
  const { characterId, plan } = item;

  stats.add('grantsRefreshed');
  const refreshed = await store.refresh(characterId);
  if (refreshed.kind === 'revoked') {
    summary.revoked++;
    deps.log('Alerts Grant revoked at SSO', { characterId });
    return;
  }
  if (refreshed.kind === 'skip') {
    summary.skipped++;
    stats.add('grantsSkippedRefresh');
    return;
  }
  const { accessToken, grant } = refreshed;

  // A 420/429 may have landed while this worker was refreshing: don't add to it.
  if (summary.budgetStopped) {
    summary.skipped++;
    stats.add('grantsSkippedBudget');
    return;
  }
  // Every device that is not dormant takes the pushes of what this run reads,
  // asleep or not: the back-off decides whether to poll, not who is told.
  const devices = liveDevices(item.devices, ctx.nowMs);
  if (plan.call.notifications) {
    const grantAlive = await pollNotifications(ctx, characterId, accessToken, grant, devices);
    if (!grantAlive) return;
  } else if (plan.idle.notifications && grant.notificationsIdle !== true) {
    // The mail mark is pollMail's to forget on this path; clearing it here too would write twice.
    await store.markIdle(characterId, grant.encryptedRefreshToken, {
      notifications: true,
      clearMail: false,
    });
    stats.add('idleStateWrites');
  }
  await pollMailSafely(ctx, characterId, accessToken, grant, devices, plan);
  if (!plan.call.nearby || !deps.nearby || !grantCoversNearby(grant) || summary.budgetStopped) {
    return;
  }

  const { nearby } = deps;
  if (nearby.hasCandidates) {
    ctx.candidates ??= nearby.hasCandidates(ctx.wantedLists);
    if (!(await ctx.candidates)) {
      // Nothing is listed anywhere, so where the Character is cannot matter: it
      // still goes through the phase (with no origin) so its devices' state is
      // brought up to date, but no token spends a call on it.
      locations.set(characterId, NO_ORIGIN_SYSTEM);
      stats.add('locationReadsSkippedNoCandidates');
      return;
    }
    if (summary.budgetStopped) return;
  }

  stats.add('esiLocationCalls');
  const location = await nearby.fetchLocation(characterId, accessToken);
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
  ctx: RunContext,
  characterId: number,
  accessToken: string,
  grant: AlertGrantDoc,
  devices: PollDevice[]
): Promise<boolean> {
  const { deps, summary, stats } = ctx;
  const { store } = deps;
  const guard = grant.encryptedRefreshToken;
  // A grant marked idle resumes here (issue #5144): its mark is stale, so the
  // feed is read afresh (no ETag) and nothing older than the earliest wanting
  // registration is pushed, exactly as enabling alerts never replays history.
  const waking = grant.notificationsIdle === true;
  const enabledAt = waking
    ? Math.max(
        grant.enabledAt,
        wakeCutoffMs(
          devices.filter((d) => d.eveTypes.length > 0),
          ctx.nowMs
        )
      )
    : grant.enabledAt;
  stats.add('esiNotificationsCalls');
  const result = await deps.fetchNotifications(
    characterId,
    accessToken,
    waking ? null : grant.etag
  );
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
      stats.add('grantsSkippedBudget');
      deps.log('ESI error budget hit; stopping this run', { retryAfterMs: result.retryAfterMs });
      return false;
    case 'error':
      summary.skipped++;
      stats.add('grantsSkippedError');
      deps.log('ESI notifications call failed', { characterId, status: result.status });
      return true;
    case 'ok':
      break;
  }

  summary.polled++;
  if (result.budgetLow) summary.budgetStopped = true;

  const selection = selectPushable({
    notifications: result.notifications,
    highWaterId: grant.highWaterId,
    enabledAt,
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
    ...(waking ? { notificationsIdle: false as const } : {}),
  });
  return true;
}

/** One Character's mail must never cost it its nearby read, or the run its other Characters. */
async function pollMailSafely(
  ctx: RunContext,
  characterId: number,
  accessToken: string,
  grant: AlertGrantDoc,
  devices: PollDevice[],
  plan: GrantPlan
): Promise<void> {
  try {
    await pollMail(ctx, characterId, accessToken, grant, devices, plan);
  } catch (err) {
    ctx.deps.log('Mail alerts failed for a Character', {
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
  ctx: RunContext,
  characterId: number,
  accessToken: string,
  grant: AlertGrantDoc,
  devices: PollDevice[],
  plan: GrantPlan
): Promise<void> {
  const { deps, summary, stats } = ctx;
  if (!deps.mail || !grantCoversMail(grant) || summary.budgetStopped) return;
  const { store } = deps;
  const guard = grant.encryptedRefreshToken;
  const wanting = devices.filter((d) => d.serverEvents?.includes('newMail'));

  // Only devices whose turn it is make the read; one asleep is still pushed to
  // when another's read finds mail, and keeps the mark while it waits.
  if (wanting.length > 0 && !plan.call.mail) return;
  if (wanting.length === 0) {
    // Nobody wants it: read nothing, and forget the mark, so turning it on again
    // seeds afresh instead of announcing everything that arrived meanwhile.
    if (grant.mailHighWaterId != null || grant.mailEtag != null) {
      await store.patchMail(characterId, guard, {
        mailHighWaterId: null,
        mailEtag: null,
        mailPushed: [],
      });
      stats.add('idleStateWrites');
    }
    return;
  }

  const seeded = grant.mailHighWaterId != null;
  stats.add('esiMailCalls');
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
    // Logged as handled, so a retry after another device's failure cannot push it later.
    if (suppressPush(nowMs, device.quietHours, undefined)) {
      for (const fire of fires) pushedNow.push(mailPushedEntry(device.deviceId, fire));
      continue;
    }
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
