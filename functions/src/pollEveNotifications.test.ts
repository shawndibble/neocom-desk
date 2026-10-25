import { describe, expect, it, vi } from 'vitest';
import type { AlertGrantDoc } from './alertGrant.js';
import type { NotificationsResult } from './esiNotifications.js';
import type { LocationResult } from './esiNearby.js';
import type { MailHeadersResult } from './esiMail.js';
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
    listActive: vi.fn(async () =>
      Object.keys(grants).map((id) => ({ characterId: Number(id), grant: grants[Number(id)]! }))
    ),
    refresh: vi.fn(async (id: number): Promise<RefreshOutcome> => {
      const outcome = await opts.refresh?.(id);
      return outcome ?? { kind: 'ok', accessToken: `access-${id}`, grant: grants[id]! };
    }),
    patch: vi.fn(async () => {}),
    markRevoked: vi.fn(async () => {}),
    dropLocationScope: vi.fn(async () => {}),
    patchMail: vi.fn(async () => {}),
    dropMailScope: vi.fn(async () => {}),
    markIdle: vi.fn(async () => {}),
    devicesForMany: vi.fn(
      async (ids: number[]) => new Map(ids.map((id) => [id, opts.devices ?? [phone]]))
    ),
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

  const wantsNearby: PollDevice = { ...phone, serverEvents: ['incursionNearby'] };

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
    const s = setup({ grants: { 1: grant(LOCATION_GRANT), 2: grant() }, devices: [wantsNearby] });
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
      devices: [wantsNearby],
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

  it('a refused location drops that scope from the grant but never revokes it', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT) }, devices: [wantsNearby] });
    const { deps, runPhase } = withNearby(s, () => ({ kind: 'forbidden' }));
    await pollEveNotifications(deps);
    expect(runPhase).toHaveBeenCalledWith(new Map());
    expect(s.store.markRevoked).not.toHaveBeenCalled();
    expect(s.store.dropLocationScope).toHaveBeenCalledWith(1, 'blob', [
      'esi-characters.read_notifications.v1',
    ]);
  });

  it('a failed location read just leaves the Character out', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT) }, devices: [wantsNearby] });
    const { deps, runPhase } = withNearby(s, () => ({ kind: 'error', status: 502 }));
    await pollEveNotifications(deps);
    expect(runPhase).toHaveBeenCalledWith(new Map());
    expect(s.store.dropLocationScope).not.toHaveBeenCalled();
  });

  it('skips the nearby phase once the shared error budget is spent', async () => {
    const s = setup({ grants: { 1: grant(LOCATION_GRANT) }, devices: [wantsNearby] });
    const { deps, runPhase } = withNearby(s, () => ({ kind: 'backoff', retryAfterMs: null }));
    const summary = await pollEveNotifications(deps);
    expect(runPhase).not.toHaveBeenCalled();
    expect(summary.budgetStopped).toBe(true);
  });
});

describe('pollEveNotifications: new-mail alerts (issue #5143)', () => {
  const MAIL_GRANT = {
    scopes: ['esi-characters.read_notifications.v1', 'esi-mail.read_mail.v1'],
    mailHighWaterId: 100,
    mailEtag: '"m1"',
    mailPushed: [],
  };
  const wantsMail: PollDevice = { ...phone, serverEvents: ['newMail'] };
  const header = (mailId: number, fromId = 900) => ({
    mailId,
    fromId,
    subject: `subject ${mailId}`,
    sentMs: Date.parse(AFTER),
  });
  const ok = (headers: ReturnType<typeof header>[], etag = '"m2"'): MailHeadersResult => ({
    kind: 'ok',
    headers,
    etag,
    budgetLow: false,
  });

  function withMail(s: ReturnType<typeof setup>, result: () => MailHeadersResult) {
    const fetchHeaders = vi.fn(async () => result());
    return { deps: { ...s.deps, mail: { fetchHeaders } }, fetchHeaders };
  }
  const mailPushes = (s: ReturnType<typeof setup>) =>
    s.sent.filter(({ m }) => m.data.eventId === 'newMail');

  it('reads mail only for a grant with the mail scope and a device that wants newMail', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT), 2: grant() }, devices: [wantsMail] });
    const { deps, fetchHeaders } = withMail(s, () => ok([]));
    await pollEveNotifications(deps);
    expect(fetchHeaders).toHaveBeenCalledTimes(1);
    expect(fetchHeaders).toHaveBeenCalledWith(1, 'access-1', '"m1"');

    const none = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [phone] });
    const quiet = withMail(none, () => ok([]));
    await pollEveNotifications(quiet.deps);
    expect(quiet.fetchHeaders).not.toHaveBeenCalled();
  });

  it('forgets the mark when no device wants newMail any more, so re-enabling seeds afresh', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [phone] });
    await pollEveNotifications(withMail(s, () => ok([])).deps);
    expect(s.store.patchMail).toHaveBeenCalledWith(1, 'blob', {
      mailHighWaterId: null,
      mailEtag: null,
      mailPushed: [],
    });
  });

  it('seeds silently on the first read: no push, the mark is the highest id, no ETag sent', async () => {
    const s = setup({
      grants: { 1: grant({ ...MAIL_GRANT, mailHighWaterId: null, mailEtag: null }) },
      devices: [wantsMail],
    });
    const { deps, fetchHeaders } = withMail(s, () => ok([header(90), header(95)]));
    await pollEveNotifications(deps);
    expect(fetchHeaders).toHaveBeenCalledWith(1, 'access-1', null);
    expect(mailPushes(s)).toHaveLength(0);
    expect(s.store.patchMail).toHaveBeenCalledWith(1, 'blob', {
      mailHighWaterId: 95,
      mailEtag: '"m2"',
      mailPushed: [],
    });
  });

  it('pushes each new mail not sent by the Character, with the fire, and advances the mark', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [wantsMail] });
    const { deps } = withMail(s, () => ok([header(103), header(101), header(102, 1), header(100)]));
    const summary = await pollEveNotifications(deps);
    const pushes = mailPushes(s);
    expect(pushes.map(({ token }) => token)).toEqual(['fcm-phone', 'fcm-phone']);
    expect(pushes.map(({ m }) => m.data.occurrenceKey)).toEqual(['1:newMail:101', '1:newMail:103']);
    expect(JSON.parse(pushes[0].m.data.fire)).toMatchObject({
      mailId: 101,
      subject: 'subject 101',
    });
    expect(summary.pushesSent).toBe(2);
    expect(s.store.patchMail).toHaveBeenCalledWith(1, 'blob', {
      mailHighWaterId: 103,
      mailEtag: '"m2"',
      mailPushed: [],
    });
  });

  it('a 304 pushes and writes nothing', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [wantsMail] });
    await pollEveNotifications(
      withMail(s, () => ({ kind: 'not-modified', budgetLow: false })).deps
    );
    expect(mailPushes(s)).toHaveLength(0);
    expect(s.store.patchMail).not.toHaveBeenCalled();
  });

  it('quiet time skips the push but still advances the mark', async () => {
    const quietNow = Date.parse('2026-10-14T13:00:00Z');
    const quietPhone: PollDevice = {
      ...wantsMail,
      quietHours: { start: '00:00', end: '23:59', timeZone: 'UTC', allowAttacks: true },
    };
    const s = setup({
      grants: { 1: grant(MAIL_GRANT) },
      devices: [quietPhone],
      now: () => quietNow,
    });
    await pollEveNotifications(withMail(s, () => ok([header(101)])).deps);
    expect(mailPushes(s)).toHaveLength(0);
    expect(s.store.patchMail).toHaveBeenCalledWith(
      1,
      'blob',
      expect.objectContaining({ mailHighWaterId: 101 })
    );
  });

  it('logs a quiet device as handled, so a retry after another device’s failure cannot push late', async () => {
    const quiet: PollDevice = {
      ...wantsMail,
      quietHours: { start: '00:00', end: '23:59', timeZone: 'UTC', allowAttacks: true },
    };
    const tablet: PollDevice = { ...wantsMail, deviceId: 'tablet', fcmToken: 'fcm-tablet' };
    const s = setup({
      grants: { 1: grant(MAIL_GRANT) },
      devices: [quiet, tablet],
      now: () => Date.parse('2026-10-14T13:00:00Z'),
      send: async () => {
        throw new Error('unavailable');
      },
    });
    await pollEveNotifications(withMail(s, () => ok([header(101)])).deps);
    expect(s.store.patchMail).toHaveBeenCalledWith(1, 'blob', {
      mailHighWaterId: 100,
      mailEtag: '"m1"',
      mailPushed: ['phone|1:newMail:101'],
    });
  });

  it('a burst pushes only the newest mails', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [wantsMail] });
    const headers = Array.from({ length: 9 }, (_, i) => header(101 + i));
    await pollEveNotifications(withMail(s, () => ok(headers)).deps);
    expect(mailPushes(s).map(({ m }) => m.data.occurrenceKey)).toEqual(
      [105, 106, 107, 108, 109].map((id) => `1:newMail:${id}`)
    );
    expect(s.store.patchMail).toHaveBeenCalledWith(
      1,
      'blob',
      expect.objectContaining({ mailHighWaterId: 109 })
    );
  });

  it('a transient send failure keeps the mark, and a retry skips what already went out', async () => {
    const tablet: PollDevice = { ...wantsMail, deviceId: 'tablet', fcmToken: 'fcm-tablet' };
    const s = setup({
      grants: { 1: grant(MAIL_GRANT) },
      devices: [wantsMail, tablet],
      send: async (token) => {
        if (token === 'fcm-tablet') throw new Error('unavailable');
      },
    });
    await pollEveNotifications(withMail(s, () => ok([header(101)])).deps);
    expect(s.store.patchMail).toHaveBeenCalledWith(1, 'blob', {
      mailHighWaterId: 100,
      mailEtag: '"m1"',
      mailPushed: ['phone|1:newMail:101'],
    });

    const retry = setup({
      grants: { 1: grant({ ...MAIL_GRANT, mailPushed: ['phone|1:newMail:101'] }) },
      devices: [wantsMail, tablet],
    });
    await pollEveNotifications(withMail(retry, () => ok([header(101)])).deps);
    expect(mailPushes(retry).map(({ token }) => token)).toEqual(['fcm-tablet']);
    expect(retry.store.patchMail).toHaveBeenCalledWith(1, 'blob', {
      mailHighWaterId: 101,
      mailEtag: '"m2"',
      mailPushed: [],
    });
  });

  it('a refused mail scope drops that scope but never revokes the grant, and nearby still runs', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [wantsMail] });
    const { deps } = withMail(s, () => ({ kind: 'forbidden' }));
    await pollEveNotifications(deps);
    expect(s.store.markRevoked).not.toHaveBeenCalled();
    expect(s.store.dropMailScope).toHaveBeenCalledWith(1, 'blob', [
      'esi-characters.read_notifications.v1',
    ]);
  });

  it('stops the run on a 420/429 and leaves the mark alone', async () => {
    const s = setup({
      grants: { 1: grant(MAIL_GRANT), 2: grant(MAIL_GRANT) },
      devices: [wantsMail],
    });
    const { deps, fetchHeaders } = withMail(s, () => ({ kind: 'backoff', retryAfterMs: null }));
    const summary = await pollEveNotifications({ ...deps, concurrency: 1 });
    expect(summary.budgetStopped).toBe(true);
    expect(fetchHeaders).toHaveBeenCalledTimes(1);
    expect(s.store.patchMail).not.toHaveBeenCalled();
  });

  it('a Firestore failure in the mail step costs the Character nothing else', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [wantsMail] });
    s.store.patchMail.mockRejectedValueOnce(new Error('boom'));
    const summary = await pollEveNotifications(withMail(s, () => ok([header(101)])).deps);
    expect(summary.skipped).toBe(0);
    expect(s.deps.log).toHaveBeenCalledWith(
      'Mail alerts failed for a Character',
      expect.anything()
    );
  });

  it('reads the devices once per run however many Characters and reads want them', async () => {
    const s = setup({ grants: { 1: grant(MAIL_GRANT) }, devices: [wantsMail] });
    await pollEveNotifications(withMail(s, () => ok([header(101)])).deps);
    expect(s.store.devicesForMany).toHaveBeenCalledTimes(1);
  });
});

describe('pollEveNotifications: skipping idle grants and stale devices (issue #5144)', () => {
  const DAY = 24 * 3_600_000;
  // Lands on the hourly slot of the stale-device back-off (floor(now / 15 min) % 4 === 0).
  const SLOT = 4_000 * 15 * 60_000;
  const OFF_SLOT = SLOT + 15 * 60_000;
  const now = () => OFF_SLOT;
  const nothingOn: PollDevice = { ...phone, eveTypes: [] };
  const MAIL_LOCATION = {
    scopes: [
      'esi-characters.read_notifications.v1',
      'esi-location.read_location.v1',
      'esi-mail.read_mail.v1',
    ],
  };

  it('neither refreshes nor calls ESI for a grant no device wants anything from, and marks it idle once', async () => {
    const s = setup({ grants: { 1: grant() }, devices: [nothingOn], now });
    const summary = await pollEveNotifications(s.deps);
    expect(s.store.refresh).not.toHaveBeenCalled();
    expect(s.deps.fetchNotifications).not.toHaveBeenCalled();
    expect(s.store.markIdle).toHaveBeenCalledWith(1, 'blob', {
      notifications: true,
      clearMail: false,
    });
    expect(summary.skipped).toBe(0);
  });

  it('writes nothing more for a grant already marked idle', async () => {
    const s = setup({
      grants: { 1: grant({ notificationsIdle: true }) },
      devices: [nothingOn],
      now,
    });
    await pollEveNotifications(s.deps);
    expect(s.store.markIdle).not.toHaveBeenCalled();
    expect(s.store.refresh).not.toHaveBeenCalled();
  });

  it('forgets the mail mark of an idle grant so turning mail on later seeds afresh', async () => {
    const s = setup({
      grants: {
        1: grant({
          ...MAIL_LOCATION,
          notificationsIdle: true,
          mailHighWaterId: 40,
          mailEtag: '"m"',
        }),
      },
      devices: [nothingOn],
      now,
    });
    await pollEveNotifications(s.deps);
    expect(s.store.markIdle).toHaveBeenCalledWith(1, 'blob', {
      notifications: false,
      clearMail: true,
    });
  });

  it('counts the run: listed, skipped by reason, devices and duration', async () => {
    const s = setup({
      grants: { 1: grant(), 2: grant(), 3: grant() },
      devices: [phone],
      now,
    });
    s.store.devicesForMany.mockResolvedValueOnce(
      new Map([
        [1, [phone]],
        [2, [nothingOn]],
        [3, [{ ...phone, updatedAtMs: OFF_SLOT - 20 * DAY }]],
      ])
    );
    const { createRunStats, ALERTS_POLL_STATS_KEYS } = await import('./runStats.js');
    const stats = createRunStats(ALERTS_POLL_STATS_KEYS);
    await pollEveNotifications({ ...s.deps, stats });
    expect(stats.snapshot()).toMatchObject({
      grantsListed: 3,
      grantsRefreshed: 1,
      grantsSkippedIdle: 1,
      grantsSkippedDeviceBackoff: 1,
      devicesRead: 1,
      devicesSleeping: 1,
      devicesDormant: 0,
      esiNotificationsCalls: 1,
      esiMailCalls: 0,
      idleStateWrites: 1,
    });
    expect(Object.keys(stats.snapshot())).toEqual([...ALERTS_POLL_STATS_KEYS]);
  });

  it('polls a stale device on the hourly run only, but a sleeping one still gets pushes', async () => {
    const stale: PollDevice = {
      ...phone,
      deviceId: 'old',
      fcmToken: 'fcm-old',
      updatedAtMs: OFF_SLOT - 20 * DAY,
    };
    const notes = () => ({
      kind: 'ok' as const,
      etag: '"n"',
      budgetLow: false,
      notifications: [note(11)],
    });
    const quiet = setup({ devices: [stale], esi: notes, now });
    await pollEveNotifications(quiet.deps);
    expect(quiet.store.refresh).not.toHaveBeenCalled();
    expect(quiet.store.markIdle).not.toHaveBeenCalled();

    const hourly = setup({ devices: [stale], esi: notes, now: () => SLOT });
    await pollEveNotifications(hourly.deps);
    expect(hourly.sent.map((x) => x.token)).toEqual(['fcm-old']);

    const mixed = setup({ devices: [phone, stale], esi: notes, now });
    await pollEveNotifications(mixed.deps);
    expect(mixed.sent.map((x) => x.token).sort()).toEqual(['fcm-old', 'fcm-phone']);
  });

  it('does not poll for a dormant device, and marks the grant idle', async () => {
    const dormant: PollDevice = { ...phone, updatedAtMs: OFF_SLOT - 120 * DAY };
    const s = setup({ devices: [dormant], now });
    await pollEveNotifications(s.deps);
    expect(s.store.refresh).not.toHaveBeenCalled();
    expect(s.store.markIdle).toHaveBeenCalledTimes(1);
  });

  it('resumes an idle grant without replaying what passed meanwhile', async () => {
    const enabledAt = Date.parse('2026-10-01T00:00:00Z');
    const registered = Date.parse('2026-10-14T12:30:00Z');
    const s = setup({
      grants: { 1: grant({ enabledAt, notificationsIdle: true, etag: '"stale"', highWaterId: 5 }) },
      devices: [{ ...phone, updatedAtMs: registered }],
      esi: () => ({
        kind: 'ok',
        etag: '"fresh"',
        budgetLow: false,
        notifications: [
          { ...note(11), timestamp: '2026-10-14T12:00:00Z' }, // before it was wanted
          { ...note(12), timestamp: '2026-10-14T13:00:00Z' }, // after
        ],
      }),
      now: () => Date.parse('2026-10-14T13:15:00Z'),
    });
    await pollEveNotifications(s.deps);
    expect(s.deps.fetchNotifications).toHaveBeenCalledWith(1, 'access-1', null);
    expect(s.sent.map((x) => x.m.data.notificationId)).toEqual(['12']);
    expect(s.store.patch).toHaveBeenCalledWith(1, 'blob', {
      highWaterId: 12,
      etag: '"fresh"',
      seenTypes: ['StructureUnderAttack', 'WarDeclared'],
      notificationsIdle: false,
    });
  });

  it('refreshes for mail alone, skips the feed, and marks its notifications idle', async () => {
    const wantsMail: PollDevice = { ...nothingOn, serverEvents: ['newMail'] };
    const s = setup({ grants: { 1: grant(MAIL_LOCATION) }, devices: [wantsMail], now });
    const fetchHeaders = vi.fn(async (): Promise<MailHeadersResult> => ({
      kind: 'ok',
      headers: [],
      etag: null,
      budgetLow: false,
    }));
    await pollEveNotifications({ ...s.deps, mail: { fetchHeaders } });
    expect(s.store.refresh).toHaveBeenCalledTimes(1);
    expect(s.deps.fetchNotifications).not.toHaveBeenCalled();
    expect(fetchHeaders).toHaveBeenCalledTimes(1);
    expect(s.store.markIdle).toHaveBeenCalledWith(1, 'blob', {
      notifications: true,
      clearMail: false,
    });
  });

  describe('the location read', () => {
    const wantsNearby: PollDevice = { ...phone, serverEvents: ['incursionNearby'] };
    function nearbyDeps(s: ReturnType<typeof setup>, hasCandidates: () => Promise<boolean>) {
      const fetchLocation = vi.fn(async (): Promise<LocationResult> => ({
        kind: 'ok',
        solarSystemId: 7,
        budgetLow: false,
      }));
      const runPhase = vi.fn(async () => ({ pushesSent: 0, budgetStopped: false }));
      const has = vi.fn(hasCandidates);
      return {
        deps: { ...s.deps, nearby: { fetchLocation, runPhase, hasCandidates: has } },
        fetchLocation,
        runPhase,
        has,
      };
    }

    it('is skipped for every Character when nothing is listed, yet the phase still sees them', async () => {
      const s = setup({
        grants: { 1: grant(MAIL_LOCATION), 2: grant(MAIL_LOCATION) },
        devices: [wantsNearby],
        now,
      });
      const { deps, fetchLocation, runPhase, has } = nearbyDeps(s, async () => false);
      const summary = await pollEveNotifications(deps);
      expect(has).toHaveBeenCalledTimes(1);
      expect(has).toHaveBeenCalledWith({ incursions: true, skyhooks: false });
      expect(fetchLocation).not.toHaveBeenCalled();
      expect(runPhase).toHaveBeenCalledWith(
        new Map([
          [1, 0],
          [2, 0],
        ])
      );
      expect(summary.located).toBe(0);
    });

    it('is read as before when a list has an entry', async () => {
      const s = setup({ grants: { 1: grant(MAIL_LOCATION) }, devices: [wantsNearby], now });
      const { deps, fetchLocation, runPhase } = nearbyDeps(s, async () => true);
      await pollEveNotifications(deps);
      expect(fetchLocation).toHaveBeenCalledTimes(1);
      expect(runPhase).toHaveBeenCalledWith(new Map([[1, 7]]));
    });
  });
});
