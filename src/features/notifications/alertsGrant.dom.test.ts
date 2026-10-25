import { describe, it, expect, vi, beforeEach } from 'vitest';
import { db } from '@/db';

const remote = vi.hoisted(() => ({
  save: vi.fn<
    (tokens: { accessToken: string; refreshToken: string }) => Promise<{ nearby?: boolean } | void>
  >(),
  del: vi.fn<(characterId: number) => Promise<void>>(),
}));
vi.mock('@/sync/alertsGrantApi', () => ({
  saveAlertGrantRemote: remote.save,
  deleteAlertGrantRemote: remote.del,
}));
const auth = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('@/auth/session', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/auth/session')>()),
  completeAlertsLogin: auth.complete,
}));

import {
  alertsRowState,
  completeAlertsGrant,
  turnOffAlerts,
  forgetAlertsGrants,
  markAlertsNeedReauth,
  readAlertsGrants,
  queueAlertsForAll,
  takeNextQueuedAlerts,
  clearAlertsQueue,
  deleteAlertGrantsBestEffort,
  readAlertsNearby,
  recordAlertsNearby,
} from './alertsGrant';

const result = (characterId: number, expectedCharacterId = characterId) => ({
  expectedCharacterId,
  characterId,
  name: `Pilot ${characterId}`,
  accessToken: 'access',
  refreshToken: 'refresh',
});

beforeEach(async () => {
  vi.clearAllMocks();
  sessionStorage.clear();
  await db.settings.clear();
  remote.save.mockResolvedValue(undefined);
  remote.del.mockResolvedValue(undefined);
});

describe('alertsRowState', () => {
  it('is off with no record, on when active, needs re-authorizing when revoked', () => {
    expect(alertsRowState(undefined)).toBe('off');
    expect(alertsRowState({ status: 'active', enabledAt: 1 })).toBe('on');
    expect(alertsRowState({ status: 'needs-reauth', enabledAt: 1 })).toBe('needs-reauth');
  });
});

describe('completeAlertsGrant', () => {
  it('on a match: sends both tokens to the server, records the row on, stores no device token', async () => {
    auth.complete.mockResolvedValue(result(111));
    const outcome = await completeAlertsGrant({ code: 'c', state: 's' });
    expect(outcome).toEqual({ status: 'on', characterId: 111, name: 'Pilot 111' });
    expect(remote.save).toHaveBeenCalledWith({ accessToken: 'access', refreshToken: 'refresh' });
    expect((await readAlertsGrants())[111]).toMatchObject({ status: 'active' });
    expect(await db.tokens.count()).toBe(0);
  });

  it('on a mismatch: stores nothing, calls no server, names who was authorized', async () => {
    auth.complete.mockResolvedValue(result(222, 111));
    const outcome = await completeAlertsGrant({ code: 'c', state: 's' });
    expect(outcome).toEqual({
      status: 'mismatch',
      expectedCharacterId: 111,
      authorizedCharacterId: 222,
      authorizedName: 'Pilot 222',
    });
    expect(remote.save).not.toHaveBeenCalled();
    expect(await readAlertsGrants()).toEqual({});
  });

  it('a server refusal leaves the row as it was and reports failure', async () => {
    auth.complete.mockResolvedValue(result(111));
    remote.save.mockRejectedValue(new Error('permission-denied'));
    expect(await completeAlertsGrant({ code: 'c', state: 's' })).toEqual({
      status: 'failed',
      characterId: 111,
    });
    expect(await readAlertsGrants()).toEqual({});
  });

  it('re-authorizing a revoked row turns it back on', async () => {
    await markAlertsNeedReauth(111);
    auth.complete.mockResolvedValue(result(111));
    await completeAlertsGrant({ code: 'c', state: 's' });
    expect(alertsRowState((await readAlertsGrants())[111])).toBe('on');
  });
});

describe('turnOffAlerts', () => {
  it('deletes the server grant, then clears the row', async () => {
    auth.complete.mockResolvedValue(result(111));
    await completeAlertsGrant({ code: 'c', state: 's' });
    expect(await turnOffAlerts(111)).toBe(true);
    expect(remote.del).toHaveBeenCalledWith(111);
    expect(await readAlertsGrants()).toEqual({});
  });

  it('keeps the row on when the delete fails, so the user can retry', async () => {
    auth.complete.mockResolvedValue(result(111));
    await completeAlertsGrant({ code: 'c', state: 's' });
    remote.del.mockRejectedValue(new Error('offline'));
    expect(await turnOffAlerts(111)).toBe(false);
    expect(alertsRowState((await readAlertsGrants())[111])).toBe('on');
  });
});

describe('removal', () => {
  it('deleteAlertGrantsBestEffort asks the server for every Character and never throws', async () => {
    remote.del.mockRejectedValueOnce(new Error('offline'));
    await expect(deleteAlertGrantsBestEffort([1, 2])).resolves.toBeUndefined();
    expect(remote.del).toHaveBeenCalledTimes(2);
  });

  it('forgetAlertsGrants drops the local rows for the given Characters only', async () => {
    await markAlertsNeedReauth(1);
    await markAlertsNeedReauth(2);
    await forgetAlertsGrants([1]);
    expect(Object.keys(await readAlertsGrants())).toEqual(['2']);
  });
});

describe('Turn on for all', () => {
  it('hands out Characters one at a time and then runs dry', () => {
    queueAlertsForAll([1, 2, 3]);
    expect(takeNextQueuedAlerts()).toBe(1);
    expect(takeNextQueuedAlerts()).toBe(2);
    expect(takeNextQueuedAlerts()).toBe(3);
    expect(takeNextQueuedAlerts()).toBeNull();
  });

  it('clearing stops it', () => {
    queueAlertsForAll([1, 2]);
    clearAlertsQueue();
    expect(takeNextQueuedAlerts()).toBeNull();
  });
});

describe('nearby alerts on the grant (ADR 0027)', () => {
  it('knows nothing until a registration says the server takes the location scope', async () => {
    expect(await readAlertsNearby()).toEqual({ supported: false, characterIds: [] });
    await recordAlertsNearby(undefined);
    expect(await readAlertsNearby()).toEqual({ supported: false, characterIds: [] });
    await recordAlertsNearby([2, 1]);
    expect(await readAlertsNearby()).toEqual({ supported: true, characterIds: [1, 2] });
  });

  it('records what the server said the saved grant covers', async () => {
    auth.complete.mockResolvedValue(result(111));
    remote.save.mockResolvedValue({ nearby: true });
    await completeAlertsGrant({ code: 'c', state: 's' });
    expect(await readAlertsNearby()).toEqual({ supported: true, characterIds: [111] });

    remote.save.mockResolvedValue({ nearby: false });
    await completeAlertsGrant({ code: 'c', state: 's' });
    expect((await readAlertsNearby()).characterIds).toEqual([]);
  });

  it('an older server answers without `nearby`: nothing changes', async () => {
    await recordAlertsNearby([111]);
    auth.complete.mockResolvedValue(result(111));
    remote.save.mockResolvedValue(undefined);
    await completeAlertsGrant({ code: 'c', state: 's' });
    expect((await readAlertsNearby()).characterIds).toEqual([111]);
  });

  it('turning alerts off forgets the Character', async () => {
    await recordAlertsNearby([111, 222]);
    await turnOffAlerts(111);
    expect((await readAlertsNearby()).characterIds).toEqual([222]);
  });
});
