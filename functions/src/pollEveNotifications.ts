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
  idleRecheckAtMs,
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
  eveTypes: string[];
  serverEvents?: string[];
  quietHours?: QuietHours;
  updatedAtMs?: number | null;
}

export interface ListedGrant {
  characterId: number;
  grant: AlertGrantDoc;
}

export type RefreshOutcome =
  | { kind: 'ok'; accessToken: string; grant: AlertGrantDoc }
  | { kind: 'revoked' }
  | { kind: 'skip' };

export interface PollerStore {
  listDue(nowMs: number): Promise<ListedGrant[]>;
  deferNextPoll(characterId: number, guard: string, atMs: number): Promise<void>;
  refresh(characterId: number): Promise<RefreshOutcome>;
  patch(
    characterId: number,
    guard: string,
    state: {
      highWaterId: number | null;
      etag: string | null;
      seenTypes: string[];
      notificationsIdle?: false;
    }
  ): Promise<void>;
  markIdle(
    characterId: number,
    guard: string,
    what: { notifications: boolean; clearMail: boolean }
  ): Promise<void>;
  markRevoked(characterId: number, guard: string): Promise<void>;
  dropLocationScope(characterId: number, guard: string, scopes: string[]): Promise<void>;
  patchMail(
    characterId: number,
    guard: string,
    state: { mailHighWaterId: number | null; mailEtag: string | null; mailPushed: string[] }
  ): Promise<void>;
  dropMailScope(characterId: number, guard: string, scopes: string[]): Promise<void>;
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
  log: (message: string, data?: Record<string, unknown>) => void;
  concurrency?: number;
  now?: () => number;
  stats?: RunStats;
  mail?: {
    fetchHeaders: (
      characterId: number,
      accessToken: string,
      etag: string | null
    ) => Promise<MailHeadersResult>;
  };
  nearby?: {
    fetchLocation: (characterId: number, accessToken: string) => Promise<LocationResult>;
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
  located: number;
  budgetStopped: boolean;
}

interface RunContext {
  deps: PollDeps;
  summary: PollSummary;
  stats: RunStats;
  locations: Map<number, number>;
  nowMs: number;
  candidates?: Promise<boolean>;
  wantedLists: { incursions: boolean; skyhooks: boolean };
}

interface PlannedGrant {
  characterId: number;
  grant: AlertGrantDoc;
  devices: PollDevice[];
  plan: GrantPlan;
  guard: string;
  deferTo: number | null;
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

  const listed = await deps.store.listDue(startedAt);
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
    queue.push({
      characterId,
      grant,
      devices,
      plan,
      guard: grant.encryptedRefreshToken,
      deferTo: plan.action === 'idle' ? idleRecheckAtMs(startedAt) : null,
    });
    if (plan.action === 'poll' && plan.call.nearby) {
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
        if (item.plan.action === 'backoff') {
          stats.add('grantsSkippedDeviceBackoff');
          await defer(ctx, item);
          continue;
        }
        if (item.plan.action === 'idle') {
          stats.add('grantsSkippedIdle');
          await markIdle(ctx, item);
          await defer(ctx, item);
          continue;
        }
        if (summary.budgetStopped) {
          summary.skipped++;
          stats.add('grantsSkippedBudget');
          continue;
        }
        await pollOne(ctx, item);
        await defer(ctx, item);
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

async function defer(ctx: RunContext, item: PlannedGrant): Promise<void> {
  if (item.deferTo === null) return;
  try {
    await ctx.deps.store.deferNextPoll(item.characterId, item.guard, item.deferTo);
  } catch (err) {
    ctx.deps.log('Alerts poll could not defer a Character', {
      characterId: item.characterId,
      error: err instanceof Error ? err.name : 'unknown',
    });
  }
}

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
  if (refreshed.kind !== 'ok') item.deferTo = null;
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
  item.guard = grant.encryptedRefreshToken;

  if (summary.budgetStopped) {
    summary.skipped++;
    stats.add('grantsSkippedBudget');
    return;
  }
  const devices = liveDevices(item.devices, ctx.nowMs);
  if (plan.call.notifications) {
    const grantAlive = await pollNotifications(ctx, characterId, accessToken, grant, devices);
    if (!grantAlive) return;
  } else if (plan.idle.notifications && grant.notificationsIdle !== true) {
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

  let transientFailure = false;
  for (const device of devices) {
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

  if (wanting.length > 0 && !plan.call.mail) return;
  if (wanting.length === 0) {
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
  const fires = selection.fires.slice(-MAX_MAIL_PUSHES);
  const nowMs = (deps.now ?? Date.now)();
  for (const device of wanting) {
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
