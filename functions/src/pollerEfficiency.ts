// Which grants and devices the closed-app pollers spend a call on (issue #5144).
// Pure: no Firestore, no ESI. pollEveNotifications.ts and serverEventPoll.ts
// feed it what they already read; the decisions are recorded in
// docs/context/decisions/ (poller efficiency).

import { grantCoversMail, grantCoversNearby, type AlertGrantDoc } from './alertGrant.js';
import { NEARBY_EVENT_IDS } from './nearbyAlerts.js';
import { isAccountStale } from './purgeStaleAccounts.js';

/** The pollers' cadence (both schedules are `every 15 minutes`). */
export const POLL_RUN_MS = 15 * 60_000;

/** A registration that re-registered within this many days is polled on every run. */
export const FRESH_DEVICE_DAYS = 14;
export const FRESH_DEVICE_MS = FRESH_DEVICE_DAYS * 24 * 3_600_000;

/** Past the fresh window a device is polled on every 4th run, i.e. hourly. */
export const SLEEPING_POLL_EVERY_RUNS = 4;

/**
 * `due`: polled this run. `sleeping`: past the fresh window, not this run's
 * turn. `dormant`: past the account inactivity window (purgeStaleAccounts.ts's
 * rule, 90 days) and not polled at all until the app registers it again.
 */
export type DeviceCadence = 'due' | 'sleeping' | 'dormant';

/**
 * `updatedAtMs` is the registration doc's `updatedAt`, stamped by every
 * `registerDevice` call (the open app re-registers hourly). A doc without one
 * is treated as fresh: nothing is held back on a guess.
 */
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

/** The slice of a registration the grant-level decision reads. */
export interface WantingDevice {
  updatedAtMs?: number | null;
  /** ESI notification types enabled for the browser channel for the Character. */
  eveTypes: readonly string[];
  serverEvents?: readonly string[];
}

/** Which of a grant's reads someone wants. */
export interface GrantWants {
  notifications: boolean;
  mail: boolean;
  /** Location, for the nearby events. */
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
    // A grant that has seen no type yet is read once so its toggles can appear:
    // a type is only offered, and so only ever enabled, after it has been seen.
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
  /**
   * `idle`: nobody live wants anything this grant covers — no refresh, no ESI.
   * `backoff`: only devices on their slow cadence want it, and it is not their
   * turn. `poll`: refresh, then read what `call` says.
   */
  action: 'idle' | 'backoff' | 'poll';
  /** The reads to make this run (devices whose turn it is). */
  call: GrantWants;
  /**
   * The reads no live device wants at all: their grant state is cleared (or
   * marked idle) so turning them on again never replays what passed meanwhile.
   */
  idle: GrantWants;
  /** Every device that is not dormant: all of them get a push for what a run reads. */
  live: number;
  sleeping: number;
  dormant: number;
}

/** The devices a grant's pushes go to: everything but the dormant. */
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

/**
 * Where a grant that was idle for notifications resumes (issue #5144). Nothing
 * older than this is pushed: a notification that passed while no device wanted
 * any must not be replayed when one is enabled ("enabling never replays
 * history"). The earliest wanting device's registration is when it began to
 * want them, so a notification after it is pushed; a device with no stamp
 * resumes from now.
 */
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

/** An idle grant (nobody live wants anything it covers) is looked at again after this many runs. */
export const IDLE_RECHECK_RUNS = 12;

/** Once a day, on this run of the day (`floor(now / POLL_RUN_MS) % RUNS_PER_DAY`), every active grant is listed. */
export const RUNS_PER_DAY = 96;
export const FULL_LISTING_RUN = 12;

/** True on the one run a day that lists every active grant, to find any with no `nextPollAt`. */
export function isFullListingRun(nowMs: number): boolean {
  return Math.floor(nowMs / POLL_RUN_MS) % RUNS_PER_DAY === FULL_LISTING_RUN;
}

/**
 * When a grant should next be listed (issue #5236), given what this run knows
 * of it. Run-slot aligned, so a slow-cadence device's hourly turn
 * (`deviceCadence`) is never missed by a few seconds of jitter. An idle grant
 * waits `IDLE_RECHECK_RUNS`, rounded up to an hourly slot. Otherwise the first
 * of the next few runs at which the plan would poll.
 */
export function nextPollAtMs(
  grant: Pick<AlertGrantDoc, 'scopes' | 'seenTypes'>,
  devices: readonly WantingDevice[],
  nowMs: number
): number {
  const slot = Math.floor(nowMs / POLL_RUN_MS);
  if (planGrant(grant, devices, nowMs).action === 'idle') {
    const wake = slot + IDLE_RECHECK_RUNS;
    return Math.ceil(wake / SLEEPING_POLL_EVERY_RUNS) * SLEEPING_POLL_EVERY_RUNS * POLL_RUN_MS;
  }
  for (let k = 1; k < SLEEPING_POLL_EVERY_RUNS; k++) {
    const at = (slot + k) * POLL_RUN_MS;
    if (planGrant(grant, devices, at).action === 'poll') return at;
  }
  return (slot + SLEEPING_POLL_EVERY_RUNS) * POLL_RUN_MS;
}
