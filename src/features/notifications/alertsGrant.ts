import { useLiveQuery } from 'dexie-react-hooks';
import { completeAlertsLogin } from '@/auth/session';
import { isSyncConfigured } from '@/app/syncStatus';
import { db } from '@/db';
import { reportFailure } from '@/observability/reportFailure';
import type { AlertsWalkStep } from './alertsNeeds';
import { MINUTE_MS } from '@/lib/age';

const GRANTS_KEY = 'alertsGrants';
const NEARBY_KEY = 'alertsNearby';
const MAIL_KEY = 'alertsMail';
const QUEUE_KEY = 'neocom.alerts.queue';
const QUEUE_TTL_MS = 15 * MINUTE_MS;
const DELETE_TIMEOUT_MS = 8_000;

export interface AlertsCallbackState {
  alertsGrant: AlertsGrantOutcome | { status: 'cancelled' };
}

export interface AlertsGrantRecord {
  status: 'active' | 'needs-reauth';
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

export type AlertsReturn =
  | { kind: 'on' }
  | { kind: 'failed' }
  | { kind: 'cancelled' }
  | { kind: 'wrong-character'; signedInAs: string };

export function alertsReturnFor(
  grant: AlertsCallbackState['alertsGrant'],
  characterId: number
): AlertsReturn | null {
  switch (grant.status) {
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'mismatch':
      return grant.expectedCharacterId === characterId
        ? { kind: 'wrong-character', signedInAs: grant.authorizedName }
        : null;
    case 'on':
      return grant.characterId === characterId ? { kind: 'on' } : null;
    case 'failed':
      return grant.characterId === characterId ? { kind: 'failed' } : null;
  }
}

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

export type AlertsExtra = 'nearby' | 'mail';
const EXTRA_KEYS: Record<AlertsExtra, string> = { nearby: NEARBY_KEY, mail: MAIL_KEY };
const ALERTS_EXTRAS = Object.keys(EXTRA_KEYS) as AlertsExtra[];

export interface AlertsExtraState {
  supported: boolean;
  characterIds: number[];
}

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

export async function recordAlertsGrantScopes(
  result: { nearbyGrants?: number[]; mailGrants?: number[] } | null | undefined
): Promise<void> {
  await recordExtra('nearby', result?.nearbyGrants);
  await recordExtra('mail', result?.mailGrants);
}

export function useAlertsGrants(): Record<number, AlertsGrantRecord> {
  return useLiveQuery(readAlertsGrants, []) ?? {};
}

export function useEveGrantMissing(): boolean | null {
  const grants = useAlertsGrants();
  if (!isSyncConfigured()) return null;
  return !Object.values(grants).some((grant) => grant.status === 'active');
}

export async function markAlertsNeedReauth(characterId: number): Promise<void> {
  await writeGrants((grants) => {
    grants[characterId] = {
      status: 'needs-reauth',
      enabledAt: grants[characterId]?.enabledAt ?? 0,
    };
  });
}

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

export async function deleteAlertGrantsBestEffort(characterIds: readonly number[]): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, DELETE_TIMEOUT_MS);
  });
  let abandoned = false;
  const deletions = (async () => {
    const { deleteAlertGrantRemote } = await import('@/sync/alertsGrantApi');
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

export function queueAlertsWalk(steps: readonly AlertsWalkStep[]): void {
  try {
    sessionStorage.setItem(
      QUEUE_KEY,
      JSON.stringify({ remaining: [...steps], createdAt: Date.now() } satisfies Queue)
    );
  } catch {}
}

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
  } catch {}
}
