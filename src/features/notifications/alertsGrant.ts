/**
 * Alerts Grant, client side (ADR 0020): the per-Character "Alerts when
 * closed" opt-in. A separate SSO authorization whose refresh token goes to the
 * server and **never** to this device — so what this device keeps is only a
 * display record of which Characters it turned on, not a credential.
 *
 * The record is device-local and informational: the server holds the truth,
 * and nothing here can read it back (the grant collection is function-only).
 * "Needs re-authorizing" is therefore set by whatever learns the grant died
 * (`markAlertsNeedReauth`), and cleared by a fresh successful grant.
 */
import { useLiveQuery } from 'dexie-react-hooks';
import { completeAlertsLogin } from '@/auth/session';
import { db } from '@/db';
import { reportFailure } from '@/observability/reportFailure';
import type { AlertsWalkStep } from './alertsNeeds';

const GRANTS_KEY = 'alertsGrants';
const NEARBY_KEY = 'alertsNearby';
const MAIL_KEY = 'alertsMail';
const QUEUE_KEY = 'neocom.alerts.queue';
/** Same bound as a Pending Login: a queue outlives no login that could still complete. */
const QUEUE_TTL_MS = 15 * 60_000;
/** A hung delete must not hold removal, Log out or delete-data. */
const DELETE_TIMEOUT_MS = 8_000;

/** What an Alerts round trip hands back, as router state, to the page it was pressed on. */
export interface AlertsCallbackState {
  alertsGrant: AlertsGrantOutcome | { status: 'cancelled' };
}

export interface AlertsGrantRecord {
  status: 'active' | 'needs-reauth';
  /** Epoch ms this device recorded the grant turning on. */
  enabledAt: number;
}

export type AlertsRowState = 'off' | 'on' | 'needs-reauth';

export function alertsRowState(record: AlertsGrantRecord | undefined): AlertsRowState {
  if (!record) return 'off';
  return record.status === 'active' ? 'on' : 'needs-reauth';
}

export type AlertsGrantOutcome =
  | { status: 'on'; characterId: number; name: string }
  | {
      status: 'mismatch';
      expectedCharacterId: number;
      authorizedCharacterId: number;
      authorizedName: string;
    }
  | { status: 'failed'; characterId: number };

export async function readAlertsGrants(): Promise<Record<number, AlertsGrantRecord>> {
  const row = await db.settings.get(GRANTS_KEY);
  const value = row?.value;
  return value && typeof value === 'object' ? (value as Record<number, AlertsGrantRecord>) : {};
}

async function writeGrants(
  change: (grants: Record<number, AlertsGrantRecord>) => void
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const grants = { ...(await readAlertsGrants()) };
    change(grants);
    await db.settings.put({ key: GRANTS_KEY, value: grants });
  });
}

/**
 * What an Alerts Grant may carry beyond notifications, as the server last
 * reported it: `nearby` is the location scope (ADR 0028), `mail` the mail scope
 * (ADR 0029). Each is stored apart, with the same shape.
 */
export type AlertsExtra = 'nearby' | 'mail';
const EXTRA_KEYS: Record<AlertsExtra, string> = { nearby: NEARBY_KEY, mail: MAIL_KEY };
const ALERTS_EXTRAS = Object.keys(EXTRA_KEYS) as AlertsExtra[];

/**
 * One extra on the grant, as the server last reported it: whether it takes the
 * scope at all, and which Characters' grants carry it. `supported` stays false
 * until a `registerDevice` answer says so, so this device never asks EVE for a
 * grant an older deployed function would refuse.
 */
export interface AlertsExtraState {
  supported: boolean;
  characterIds: number[];
}
export type AlertsNearby = AlertsExtraState;

export async function readAlertsExtra(extra: AlertsExtra): Promise<AlertsExtraState> {
  const value = (await db.settings.get(EXTRA_KEYS[extra]))?.value as
    Partial<AlertsExtraState> | undefined;
  return {
    supported: value?.supported === true,
    characterIds: Array.isArray(value?.characterIds)
      ? value.characterIds.filter((id): id is number => typeof id === 'number')
      : [],
  };
}

const NONE: AlertsExtraState = { supported: false, characterIds: [] };

/** {@link readAlertsExtra}, live. Reads as unsupported until loaded. */
export function useAlertsExtra(extra: AlertsExtra): AlertsExtraState {
  return useLiveQuery(() => readAlertsExtra(extra), [extra]) ?? NONE;
}

async function writeExtra(
  extra: AlertsExtra,
  change: (ids: Set<number>) => void,
  supported?: true
): Promise<void> {
  await db.transaction('rw', db.settings, async () => {
    const current = await readAlertsExtra(extra);
    const ids = new Set(current.characterIds);
    change(ids);
    const value: AlertsExtraState = {
      supported: supported ?? current.supported,
      characterIds: [...ids].sort((a, b) => a - b),
    };
    await db.settings.put({ key: EXTRA_KEYS[extra], value });
  });
}

/** A `registerDevice` answer's grant list for one extra; absent (an older server, a failed read) changes nothing. */
async function recordExtra(extra: AlertsExtra, grants: readonly number[] | undefined) {
  if (grants === undefined) return;
  await writeExtra(
    extra,
    (ids) => {
      ids.clear();
      for (const id of grants) ids.add(id);
    },
    true
  );
}

export const readAlertsNearby = () => readAlertsExtra('nearby');
export const useAlertsNearby = () => useAlertsExtra('nearby');
export const recordAlertsNearby = (nearbyGrants: readonly number[] | undefined) =>
  recordExtra('nearby', nearbyGrants);
export const readAlertsMail = () => readAlertsExtra('mail');
export const useAlertsMail = () => useAlertsExtra('mail');

/** Everything a `registerDevice` answer says about the grants' scopes. */
export async function recordAlertsGrantScopes(
  result: { nearbyGrants?: number[]; mailGrants?: number[] } | null | undefined
): Promise<void> {
  await recordExtra('nearby', result?.nearbyGrants);
  await recordExtra('mail', result?.mailGrants);
}

/** {@link readAlertsGrants}, live. Empty until loaded. */
export function useAlertsGrants(): Record<number, AlertsGrantRecord> {
  return useLiveQuery(readAlertsGrants, []) ?? {};
}

/** The server told us, or a poll learned, that this Character's grant is dead. */
export async function markAlertsNeedReauth(characterId: number): Promise<void> {
  await writeGrants((grants) => {
    grants[characterId] = {
      status: 'needs-reauth',
      enabledAt: grants[characterId]?.enabledAt ?? 0,
    };
  });
}

/** Local rows only, for Characters leaving the device. The server side is `deleteAlertGrantsBestEffort`. */
export async function forgetAlertsGrants(characterIds: readonly number[]): Promise<void> {
  await writeGrants((grants) => {
    for (const id of characterIds) delete grants[id];
  });
  for (const extra of ALERTS_EXTRAS) {
    await writeExtra(extra, (ids) => {
      for (const id of characterIds) ids.delete(id);
    });
  }
}

/**
 * Finish an Alerts round trip. A match hands the refresh token to the server
 * and records the row on; a mismatch stores and sends nothing, because the
 * token belongs to a Character the user did not press. The tokens live only in
 * this call's locals.
 */
export async function completeAlertsGrant(params: {
  code: string;
  state: string;
}): Promise<AlertsGrantOutcome> {
  const result = await completeAlertsLogin(params);
  if (result.characterId !== result.expectedCharacterId) {
    return {
      status: 'mismatch',
      expectedCharacterId: result.expectedCharacterId,
      authorizedCharacterId: result.characterId,
      authorizedName: result.name,
    };
  }
  let saved: { nearby?: boolean; mail?: boolean } | void;
  try {
    const { saveAlertGrantRemote } = await import('@/sync/alertsGrantApi');
    saved = await saveAlertGrantRemote({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    reportFailure('auth', error);
    return { status: 'failed', characterId: result.characterId };
  }
  await writeGrants((grants) => {
    grants[result.characterId] = { status: 'active', enabledAt: Date.now() };
  });
  // Only a server that knows a scope says so in its answer, so this also proves
  // the server takes it.
  for (const extra of ALERTS_EXTRAS) {
    const covered = saved?.[extra];
    if (typeof covered !== 'boolean') continue;
    await writeExtra(
      extra,
      (ids) => {
        if (covered) ids.add(result.characterId);
        else ids.delete(result.characterId);
      },
      true
    );
  }
  return { status: 'on', characterId: result.characterId, name: result.name };
}

/** Delete the server grant, then the row. `false` leaves the row as it was. */
export async function turnOffAlerts(characterId: number): Promise<boolean> {
  try {
    const { deleteAlertGrantRemote } = await import('@/sync/alertsGrantApi');
    await deleteAlertGrantRemote(characterId);
  } catch (error) {
    reportFailure('auth', error);
    return false;
  }
  await forgetAlertsGrants([characterId]);
  return true;
}

/**
 * Drop the server grant for each Character as it leaves the device (Remove
 * Character, Log out, delete-data). Asked of the server whether or not this
 * device turned it on: another device may have, and its token would otherwise
 * sit there until the inactivity purge. Needs each Character's sign-in, so it
 * runs before the local removal; bounded and never throws, like
 * `removeSharedBlueprints` — a hung or failed delete must not keep a Character
 * on the device.
 */
export async function deleteAlertGrantsBestEffort(characterIds: readonly number[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DELETE_TIMEOUT_MS);
  });
  // Set once the timeout wins: the loop then stops signing in as further
  // Characters, which would fight the caller's own sync and sign-out for the
  // one Firebase session slot.
  let abandoned = false;
  const deletions = (async () => {
    const { deleteAlertGrantRemote } = await import('@/sync/alertsGrantApi');
    // One at a time: Firebase has a single session slot.
    for (const id of characterIds) {
      if (abandoned) return;
      await deleteAlertGrantRemote(id).catch(() => undefined);
    }
  })().catch(() => undefined);
  try {
    await Promise.race([deletions, timeout]);
  } finally {
    abandoned = true;
    clearTimeout(timer);
  }
}

interface Queue {
  remaining: AlertsWalkStep[];
  createdAt: number;
}

function isStep(value: unknown): value is AlertsWalkStep {
  const step = value as Partial<AlertsWalkStep> | null;
  return (
    typeof step === 'object' &&
    step !== null &&
    typeof step.characterId === 'number' &&
    typeof step.nearby === 'boolean' &&
    typeof step.mail === 'boolean'
  );
}

/**
 * The walk: the Characters still to sign in, each with the exact optional
 * scopes the player agreed to on the listing, kept across the SSO round trips
 * between them.
 */
export function queueAlertsWalk(steps: readonly AlertsWalkStep[]): void {
  try {
    sessionStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({ remaining: [...steps], createdAt: Date.now() } satisfies Queue)
    );
  } catch {
    // No queue: only the first Character is offered, the rest stay one press each.
  }
}

/** The next step of the walk, or `null` when the queue is empty, expired or absent. */
export function takeNextQueuedAlerts(): AlertsWalkStep | null {
  try {
    const raw = sessionStorage.getItem(QUEUE_KEY);
    if (raw === null) return null;
    const queue = JSON.parse(raw) as Partial<Queue>;
    if (
      !Array.isArray(queue.remaining) ||
      typeof queue.createdAt !== 'number' ||
      Date.now() - queue.createdAt > QUEUE_TTL_MS
    ) {
      sessionStorage.removeItem(QUEUE_KEY);
      return null;
    }
    const [next, ...rest] = queue.remaining as unknown[];
    if (!isStep(next)) {
      sessionStorage.removeItem(QUEUE_KEY);
      return null;
    }
    sessionStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({ remaining: rest, createdAt: queue.createdAt })
    );
    return next;
  } catch {
    return null;
  }
}

export function clearAlertsQueue(): void {
  try {
    sessionStorage.removeItem(QUEUE_KEY);
  } catch {
    // Nothing queued that could misfire.
  }
}
