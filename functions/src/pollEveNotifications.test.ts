import { describe, expect, it, vi } from 'vitest';
import type { AlertGrantDoc } from './alertGrant.js';
import type { NotificationsResult } from './esiNotifications.js';
import type { LocationResult } from './esiNearby.js';
import type { PushMessage } from './eveNotificationPush.js';
import {
  pollEveNotifications,
  type PollDevice,
  type PollerStore,
  type RefreshOutcome,
} from './pollEveNotifications.js';

const ENABLED_AT = Date.parse('2026-10-14T12:00:00Z');
const AFTER = '2026-10-14T13:00:00Z';

const grant = (over: Partial<AlertGrantDoc> = {}): AlertGrantDoc => ({
  encryptedRefreshToken: 'blob',
  clientId: 'c',
  enabledAt: ENABLED_AT,
  highWaterId: 10,
  etag: '"old"',
  seenTypes: ['WarDeclared', 'StructureUnderAttack'],
  status: 'active',
  ...over,
});

const note = (id: number, type = 'WarDeclared') => ({
  notification_id: id,
  type,
  timestamp: AFTER,
  text: 't',
});

const phone: PollDevice = {
  deviceId: 'phone',
  fcmToken: 'fcm-phone',
  eveTypes: ['WarDeclared'],
};

function setup(opts: {
  grants?: Record<number, AlertGrantDoc>;
  devices?: PollDevice[];
  refresh?: (id: number) => Promise<RefreshOutcome | void>;
  esi?: (id: number) => NotificationsResult;
  send?: (token: string, m: PushMessage) => Promise<void>;
  now?: () => number;
}) {
  const grants = opts.grants ?? { 1: grant() };
  const store = {
    listActive: vi.fn(async () => Object.keys(grants).map(Number)),
    refresh: vi.fn(async (id: number): Promise<RefreshOutcome> => {
      const outcome = await opts.refresh?.(id);
      return outcome ?? { kind: 'ok', accessToken: `access-${id}`, grant: grants[id]! };
    }),
    patch: vi.fn(async () => {}),
    markRevoked: vi.fn(async () => {}),
    devicesFor: vi.fn(async () => opts.devices ?? [phone]),
    deleteDevice: vi.fn(async () => {}),
  } satisfies PollerStore;
  const sent: { token: string; m: PushMessage }[] = [];
  const deps = {
    store,
    fetchNotifications: vi.fn(async (id: number) =>
      (opts.esi ?? (() => ({ kind: 'ok', notifications: [], etag: '"new"', budgetLow: false })))(id)
    ),
    send: vi.fn(async (token: string, m: PushMessage) => {
      await opts.send?.(token, m);
      sent.push({ token, m });
    }),
    log: vi.fn(),
    ...(opts.now ? { now: opts.now } : {}),
  };
  return { store, deps, sent };
}

describe('pollEveNotifications', () => {
  it('pushes exactly the expected notifications and advances state', async () => {
    const { store, deps, sent } = setup({
      esi: () => ({
        kind: 'ok',
        etag: '"new"',
        budgetLow: false,
        notifications: [
          note(9), // at/below high-water
          note(11),
          note(12, 'KillReportVictim'), // not enabled on the device, first sighting
          note(13),
        ],
      }),
    });
    const summary = await pollEveNotifications(deps);
    expect(sent.map((s) => s.m.data.notificationId)).toEqual(['11', '13']);
    expect(sent.every((s) => s.token === 'fcm-phone')).toBe(true);
    expect(store.patch).toHaveBeenCalledWith(1, 'blob', {
      highWaterId: 13,
      etag: '"new"',
      seenTypes: ['KillReportVictim', 'StructureUnderAttack', 'WarDeclared'],
    });
    expect(summary).toMatchObject({ polled: 1, pushesSent: 2 });
  });

  it('first poll after enabling replays no history', async () => {
    const { deps, sent, store } = setup({
      grants: { 1: grant({ highWaterId: null, seenTypes: [] }) },
      esi: () => ({
        kind: 'ok',
        etag: null,
        budgetLow: false,
        notifications: [
          { ...note(1), timestamp: '2026-10-14T01:00:00Z' },
          { ...note(2), timestamp: '2026-10-14T02:00:00Z' },
        ],
      }),
    });
    await pollEveNotifications(deps);
    expect(sent).toEqual([]);
    expect(store.patch).toHaveBeenCalledWith(1, 'blob', {
      highWaterId: 2,
      etag: null,
      seenTypes: ['WarDeclared'],
    });
  });

  it('sends one summary push when more than 3 are pushable', async () => {
    const { deps, sent } = setup({
      esi: () => ({
        kind: 'ok',
        etag: null,
        budgetLow: false,
        notifications: [note(11), note(12), note(13), note(14)],
      }),
    });
    await pollEveNotifications(deps);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.m.collapseKey).toBe('eve-1');
  });

  it('a 304 costs nothing: no writes, no pushes', async () => {
    const { deps, store, sent } = setup({
      esi: () => ({ kind: 'not-modified', budgetLow: false }),
    });
    const summary = await pollEveNotifications(deps);
    expect(store.patch).not.toHaveBeenCalled();
    expect(store.markRevoked).not.toHaveBeenCalled();
    expect(sent).toEqual([]);
    expect(summary.notModified).toBe(1);
  });

  it('a 403 revokes the grant and does not poll further', async () => {
    const { deps, store } = setup({ esi: () => ({ kind: 'forbidden' }) });
    const summary = await pollEveNotifications(deps);
    expect(store.markRevoked).toHaveBeenCalledWith(1, 'blob');
    expect(store.patch).not.toHaveBeenCalled();
    expect(summary.revoked).toBe(1);
  });

  it('invalid_grant at SSO revokes without calling ESI; other refresh errors only skip', async () => {
    const dead = setup({ refresh: async () => ({ kind: 'revoked' }) });
    const summary = await pollEveNotifications(dead.deps);
    expect(summary.revoked).toBe(1);
    expect(dead.deps.fetchNotifications).not.toHaveBeenCalled();

    const flaky = setup({
      refresh: async () => {
        throw new Error('SSO refresh failed (503)');
      },
    });
    const after = await pollEveNotifications(flaky.deps);
    expect(flaky.store.markRevoked).not.toHaveBeenCalled();
    expect(after.skipped).toBe(1);
  });

  it('a grant replaced mid-refresh is skipped', async () => {
    const { deps } = setup({ refresh: async () => ({ kind: 'skip' }) });
    const summary = await pollEveNotifications(deps);
    expect(summary.skipped).toBe(1);
    expect(deps.fetchNotifications).not.toHaveBeenCalled();
  });

  it('a transient push failure keeps state and ETag so the next poll retries', async () => {
    const { deps, store } = setup({
      esi: () => ({ kind: 'ok', etag: '"new"', budgetLow: false, notifications: [note(11)] }),
      send: async () => {
        throw Object.assign(new Error('unavailable'), { code: 'messaging/server-unavailable' });
      },
    });
    const summary = await pollEveNotifications(deps);
    expect(store.patch).not.toHaveBeenCalled();
    expect(store.deleteDevice).not.toHaveBeenCalled();
    expect(summary.skipped).toBe(1);
  });

  it('a 420/429 stops the run: remaining grants are skipped, not retried', async () => {
    const { deps, summaryOf } = (() => {
      const s = setup({
        grants: { 1: grant(), 2: grant(), 3: grant() },
        esi: () => ({ kind: 'backoff', retryAfterMs: 1000 }),
      });
      return { deps: { ...s.deps, concurrency: 1 }, summaryOf: s };
    })();
    const summary = await pollEveNotifications(deps);
    expect(summary.budgetStopped).toBe(true);
    expect(deps.fetchNotifications).toHaveBeenCalledTimes(1);
    expect(summary.skipped).toBe(3);
    expect(summaryOf.store.patch).not.toHaveBeenCalled();
  });

  it('a dead FCM token deletes that registration; other devices still get pushes', async () => {
    const laptop: PollDevice = {
      deviceId: 'laptop',
      fcmToken: 'fcm-laptop',
      eveTypes: ['WarDeclared'],
    };
    const { deps, store, sent } = setup({
      devices: [phone, laptop],
      esi: () => ({ kind: 'ok', etag: null, budgetLow: false, notifications: [note(11)] }),
      send: async (token) => {
        if (token === 'fcm-phone') {
          throw Object.assign(new Error('gone'), {
            code: 'messaging/registration-token-not-registered',
          });
        }
      },
    });
    await pollEveNotifications(deps);
    expect(store.deleteDevice).toHaveBeenCalledWith('phone');
    expect(sent.map((s) => s.token)).toEqual(['fcm-laptop']);
    expect(store.patch).toHaveBeenCalled();
  });

  it('one Character failing does not stop the others', async () => {
    const { deps, store } = setup({
      grants: { 1: grant(), 2: grant() },
      refresh: async (id) => {
        if (id === 1) throw new Error('boom');
      },
      esi: () => ({ kind: 'ok', etag: null, budgetLow: false, notifications: [] }),
    });
    const summary = await pollEveNotifications(deps);
    expect(summary).toMatchObject({ polled: 1, skipped: 1 });
    expect(store.patch).toHaveBeenCalledWith(2, 'blob', expect.anything());
  });
});

describe('quiet time (issue #4566)', () => {
  // 13:00Z; AFTER is 13:00Z too.
  const NOW = Date.parse('2026-10-14T13:30:00Z');
  const window = (over: Partial<NonNullable<PollDevice['quietHours']>> = {}) => ({
    start: '13:00',
    end: '14:00',
    timeZone: 'UTC',
    allowAttacks: false,
    ...over,
  });
  const attackDevice = (quietHours: PollDevice['quietHours']): PollDevice => ({
    ...phone,
    eveTypes: ['WarDeclared', 'StructureUnderAttack'],
    quietHours,
  });
  const feed = () => ({
    kind: 'ok' as const,
    etag: '"new"',
    budgetLow: false,
    notifications: [note(11), note(12, 'StructureUnderAttack')],
  });

  it('sends nothing inside the window, yet still advances the high-water mark', async () => {
    const { deps, sent, store } = setup({
      devices: [attackDevice(window())],
      esi: feed,
      now: () => NOW,
    });
    await pollEveNotifications(deps);
    expect(sent).toEqual([]);
    expect(store.patch).toHaveBeenCalledWith(
      1,
      'blob',
      expect.objectContaining({ highWaterId: 12 })
    );
  });

  it('sends outside the window', async () => {
    const { deps, sent } = setup({
      devices: [attackDevice(window({ start: '20:00', end: '21:00' }))],
      esi: feed,
      now: () => NOW,
    });
    await pollEveNotifications(deps);
    expect(sent.map((s) => s.m.data.notificationId)).toEqual(['11', '12']);
  });

  it('lets only attacks through when the checkbox is ticked', async () => {
    const { deps, sent } = setup({
      devices: [attackDevice(window({ allowAttacks: true }))],
      esi: feed,
      now: () => NOW,
    });
    await pollEveNotifications(deps);
    expect(sent.map((s) => s.m.data.notificationId)).toEqual(['12']);
  });

  it('only silences the device whose window it is', async () => {
    const other: PollDevice = { ...phone, deviceId: 'tablet', fcmToken: 'fcm-tablet' };
    const { deps, sent } = setup({
      devices: [attackDevice(window()), other],
      esi: feed,
      now: () => NOW,
    });
    await pollEveNotifications(deps);
    expect(sent.map((s) => s.token)).toEqual(['fcm-tablet']);
  });
});

describe('pollEveNotifications: nearby alerts (issue #5122)', () => {
  const LOCATION_GRANT = {
    scopes: ['esi-characters.read_notifications.v1', 'esi-location.read_location.v1'],
  };

  function withNearby(
    s: ReturnType<typeof setup>,
    location: (id: number) => LocationResult = () => ({
      kind: 'ok',
      solarSystemId: 30000142,
      budgetLow: false,
    })
  ) {
    const fetchLocation = vi.fn<(id: number, token: string) => Promise<LocationResult>>(
      async (id) => location(id)
    );
    const runPhase = vi.fn(async () => ({ pushesSent: 2, budgetStopped: false }));
    return {
      deps: { ...s.deps, nearby: { fetchLocation, runPhase } },
      fetchLocation,
      runPhase,
    };
  }

  it('reads the location only for a grant that carries the location scope', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT), 2: grant() } });
    const { deps, fetchLocation, runPhase } = withNearby(s);
    const summary = await pollEveNotifications(deps);
    expect(fetchLocation).toHaveBeenCalledTimes(1);
    expect(fetchLocation).toHaveBeenCalledWith(1, 'access-1');
    expect(runPhase).toHaveBeenCalledWith(new Map([[1, 30000142]]));
    expect(summary).toMatchObject({ located: 1, pushesSent: 2 });
  });

  it('still reads the location when the notifications feed answered 304', async () => {
    const s = setup({
      grants: { 1: grant(LOCATION_GRANT) },
      esi: () => ({ kind: 'not-modified', budgetLow: false }),
    });
    const { deps, fetchLocation } = withNearby(s);
    await pollEveNotifications(deps);
    expect(fetchLocation).toHaveBeenCalledTimes(1);
  });

  it('never reads the location of a grant ESI just rejected', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT) }, esi: () => ({ kind: 'forbidden' }) });
    const { deps, fetchLocation } = withNearby(s);
    await pollEveNotifications(deps);
    expect(fetchLocation).not.toHaveBeenCalled();
  });

  it('leaves out a Character whose location could not be read, and does not revoke it', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT) } });
    const { deps, runPhase } = withNearby(s, () => ({ kind: 'forbidden' }));
    await pollEveNotifications(deps);
    expect(runPhase).toHaveBeenCalledWith(new Map());
    expect(s.store.markRevoked).not.toHaveBeenCalled();
  });

  it('skips the nearby phase once the shared error budget is spent', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT) } });
    const { deps, runPhase } = withNearby(s, () => ({ kind: 'backoff', retryAfterMs: null }));
    const summary = await pollEveNotifications(deps);
    expect(runPhase).not.toHaveBeenCalled();
    expect(summary.budgetStopped).toBe(true);
  });
});
