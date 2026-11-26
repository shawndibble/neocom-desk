import { grantCoversMail, grantCoversNearby, type AlertGrantDoc } from './alertGrant.js';
import { NEARBY_EVENT_IDS } from './nearbyAlerts.js';
import { isAccountStale } from './purgeStaleAccounts.js';

export const POLL_RUN_MS = 15 * 60_000;

export const FRESH_DEVICE_DAYS = 14;
export const FRESH_DEVICE_MS = FRESH_DEVICE_DAYS * 24 * 3_600_000;

export const SLEEPING_POLL_EVERY_RUNS = 4;

export type DeviceCadence = 'due' | 'sleeping' | 'dormant';

export function deviceCadence(
  updatedAtMs: number | null | undefined,
  nowMs: number
): DeviceCadence {
  if (updatedAtMs === null || updatedAtMs === undefined || !Number.isFinite(updatedAtMs)) {
    return 'due';
  }
  if (nowMs - updatedAtMs <= FRESH_DEVICE_MS) return 'due';
  if (isAccountStale(updatedAtMs, nowMs)) return 'dormant';
  return Math.floor(nowMs / POLL_RUN_MS) % SLEEPING_POLL_EVERY_RUNS === 0 ? 'due' : 'sleeping';
}

export interface WantingDevice {
  updatedAtMs?: number | null;
  eveTypes: readonly string[];
  serverEvents?: readonly string[];
}

export interface GrantWants {
  notifications: boolean;
  mail: boolean;
  nearby: boolean;
}

const NONE: GrantWants = { notifications: false, mail: false, nearby: false };

function wantsOf(
  grant: Pick<AlertGrantDoc, 'scopes' | 'seenTypes'>,
  devices: readonly WantingDevice[],
  bootstrap: boolean
): GrantWants {
  const mailScope = grantCoversMail(grant);
  const nearbyScope = grantCoversNearby(grant);
  return {
    notifications: bootstrap || devices.some((d) => d.eveTypes.length > 0),
    mail: mailScope && devices.some((d) => d.serverEvents?.includes('newMail')),
    nearby:
      nearbyScope &&
      devices.some((d) =>
        (NEARBY_EVENT_IDS as readonly string[]).some((id) => d.serverEvents?.includes(id))
      ),
  };
}

export const anyWanted = (wants: GrantWants): boolean =>
  wants.notifications || wants.mail || wants.nearby;

export interface GrantPlan {
  action: 'idle' | 'backoff' | 'poll';
  call: GrantWants;
  idle: GrantWants;
  live: number;
  sleeping: number;
  dormant: number;
}

export function liveDevices<T extends { updatedAtMs?: number | null }>(
  devices: readonly T[],
  nowMs: number
): T[] {
  return devices.filter((d) => deviceCadence(d.updatedAtMs, nowMs) !== 'dormant');
}

export function planGrant(
  grant: Pick<AlertGrantDoc, 'scopes' | 'seenTypes'>,
  devices: readonly WantingDevice[],
  nowMs: number
): GrantPlan {
  const cadence = devices.map((d) => deviceCadence(d.updatedAtMs, nowMs));
  const live = devices.filter((_, i) => cadence[i] !== 'dormant');
  const due = devices.filter((_, i) => cadence[i] === 'due');
  const bootstrap = grant.seenTypes.length === 0;
  const anyLive = wantsOf(grant, live, bootstrap && live.length > 0);
  const call = wantsOf(grant, due, bootstrap && due.length > 0);
  const counts = {
    live: live.length,
    sleeping: cadence.filter((c) => c === 'sleeping').length,
    dormant: cadence.filter((c) => c === 'dormant').length,
  };
  const idle: GrantWants = {
    notifications: !anyLive.notifications,
    mail: grantCoversMail(grant) && !anyLive.mail,
    nearby: false,
  };
  if (!anyWanted(anyLive)) return { action: 'idle', call: NONE, idle, ...counts };
  if (!anyWanted(call)) return { action: 'backoff', call: NONE, idle, ...counts };
  return { action: 'poll', call, idle, ...counts };
}

export function wakeCutoffMs(
  wanting: readonly { updatedAtMs?: number | null }[],
  nowMs: number
): number {
  let cutoff = nowMs;
  for (const device of wanting) {
    const stamp = device.updatedAtMs;
    if (stamp === null || stamp === undefined || !Number.isFinite(stamp)) return nowMs;
    cutoff = Math.min(cutoff, stamp);
  }
  return cutoff;
}

export const IDLE_RECHECK_RUNS = 12;

export const RUNS_PER_DAY = 96;
export const FULL_LISTING_RUN = 12;

export function isFullListingRun(nowMs: number): boolean {
  return Math.floor(nowMs / POLL_RUN_MS) % RUNS_PER_DAY === FULL_LISTING_RUN;
}

export function idleRecheckAtMs(nowMs: number): number {
  const wake = Math.floor(nowMs / POLL_RUN_MS) + IDLE_RECHECK_RUNS;
  return Math.ceil(wake / SLEEPING_POLL_EVERY_RUNS) * SLEEPING_POLL_EVERY_RUNS * POLL_RUN_MS;
}
