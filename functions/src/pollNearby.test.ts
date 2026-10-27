import { describe, expect, it, vi } from 'vitest';
import type { PushMessage } from './eveNotificationPush.js';
import type { StoredNearby } from './nearbyAlerts.js';
import {
  runNearbyPhase,
  type NearbyDeps,
  type NearbyDevice,
  type NearbyDeviceState,
} from './pollNearby.js';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const JITA = 30000142;
const PERIMETER = 30000144;
const NEW_CALDARI = 30000145;

const device = (over: Partial<NearbyDevice> = {}): NearbyDevice => ({
  state: { characters: {}, pushed: {} },
  deviceId: 'phone',
  fcmToken: 'fcm-phone',
  characterIds: [1],
  serverEventsByCharacter: { '1': ['incursionNearby', 'skyhookRaidableNearby'] },
  nearbyJumpsByCharacter: { '1': { incursionNearby: 5, skyhookRaidableNearby: 5 } },
  routeRules: { preference: 'shortest', securityPenalty: 50, avoid: [] },
  ...over,
});

const incursion = {
  constellation_id: 20000020,
  staging_solar_system_id: PERIMETER,
  state: 'established',
};

/** A stored baseline: nothing in range, from Jita, N = 5. */
const quietBaseline: StoredNearby = {
  incursion: { frame: { originSystemId: JITA, withinJumps: 5 }, inRange: [] },
  skyhook: { frame: { originSystemId: JITA, withinJumps: 5 }, inRange: [] },
};

function setup(opts: {
  devices?: NearbyDevice[];
  state?: Record<string, NearbyDeviceState>;
  incursions?: unknown[] | null;
  skyhooks?: unknown[] | null;
  send?: (token: string, m: PushMessage) => Promise<void>;
}) {
  const states: Record<string, NearbyDeviceState> = { ...(opts.state ?? {}) };
  const store = {
    devicesFor: vi.fn(async () =>
      (opts.devices ?? [device()]).map((d) => ({
        ...d,
        state: states[d.deviceId] ?? { characters: {}, pushed: {} },
      }))
    ),
    writeState: vi.fn(async (id: string, s: NearbyDeviceState) => void (states[id] = s)),
    deleteDevice: vi.fn(async () => {}),
  };
  const deps: NearbyDeps = {
    store,
    fetchIncursions: vi.fn(async () =>
      opts.incursions === null
        ? { kind: 'error' as const, status: 500 }
        : {
            kind: 'ok' as const,
            value: (opts.incursions ?? [incursion]) as never[],
            budgetLow: false,
          }
    ),
    fetchRaidableSkyhooks: vi.fn(async () =>
      opts.skyhooks === null
        ? { kind: 'error' as const, status: 500 }
        : { kind: 'ok' as const, value: (opts.skyhooks ?? []) as never[], budgetLow: false }
    ),
  };
  const sent: { token: string; m: PushMessage }[] = [];
  const send = vi.fn(async (token: string, m: PushMessage) => {
    await opts.send?.(token, m);
    sent.push({ token, m });
  });
  return { deps, store, states, sent, send };
}

const run = (s: ReturnType<typeof setup>, locations = new Map([[1, JITA]]), nowMs = NOW) =>
  runNearbyPhase({ deps: s.deps, locations, send: s.send, log: vi.fn(), nowMs });

describe('runNearbyPhase', () => {
  it('pushes an Incursion that came within N jumps, keyed as the app keys it', async () => {
    const s = setup({ state: { phone: { characters: { '1': quietBaseline }, pushed: {} } } });
    const result = await run(s);
    expect(result.pushesSent).toBe(1);
    expect(s.sent).toHaveLength(1);
    expect(s.sent[0].token).toBe('fcm-phone');
    expect(s.sent[0].m.data).toMatchObject({
      characterId: '1',
      eventId: 'incursionNearby',
      occurrenceKey: `incursionNearby:20000020:${PERIMETER}`,
      fireAt: String(NOW),
    });
    expect(JSON.parse(s.sent[0].m.data.fire)).toEqual({
      eventId: 'incursionNearby',
      characterId: 1,
      constellationId: 20000020,
      stagingSystemId: PERIMETER,
      state: 'established',
      jumps: 1,
    });
    expect(s.sent[0].m.data.title).toBeTruthy();
    expect(s.states.phone.pushed).toEqual({
      [`incursionNearby:20000020:${PERIMETER}`]: NOW,
    });
  });

  it('pushes nothing on a first poll, only stores the baseline', async () => {
    const s = setup({});
    expect((await run(s)).pushesSent).toBe(0);
    expect(s.states.phone.characters['1'].incursion?.inRange).toHaveLength(1);
  });

  it('does not push an occurrence this device was already pushed (another Character)', async () => {
    const key = `incursionNearby:20000020:${PERIMETER}`;
    const s = setup({
      state: { phone: { characters: { '1': quietBaseline }, pushed: { [key]: NOW + 1 } } },
    });
    expect((await run(s)).pushesSent).toBe(0);
    // The edge is still consumed.
    expect(s.states.phone.characters['1'].incursion?.inRange).toHaveLength(1);
  });

  it('skips a device inside Quiet Time without logging the push', async () => {
    const hour = new Date(NOW).getUTCHours();
    const hh = (h: number) => `${String((h + 24) % 24).padStart(2, '0')}:00`;
    const s = setup({
      devices: [
        device({
          quietHours: {
            start: hh(hour - 1),
            end: hh(hour + 1),
            timeZone: 'UTC',
            allowAttacks: true,
          },
        }),
      ],
      state: { phone: { characters: { '1': quietBaseline }, pushed: {} } },
    });
    expect((await run(s)).pushesSent).toBe(0);
    expect(s.states.phone.pushed).toEqual({});
  });

  it('ignores a device that enabled neither nearby event, and reads no list for it', async () => {
    const s = setup({ devices: [device({ serverEventsByCharacter: { '1': ['shipLost'] } })] });
    await run(s);
    expect(s.deps.fetchIncursions).not.toHaveBeenCalled();
    expect(s.deps.fetchRaidableSkyhooks).not.toHaveBeenCalled();
    expect(s.store.writeState).not.toHaveBeenCalled();
  });

  it('uses the device’s own N and Travel Settings', async () => {
    // N = 1: Perimeter is one jump from Jita, with an unrelated Avoided System.
    const s = setup({
      devices: [
        device({
          nearbyJumpsByCharacter: { '1': { incursionNearby: 1 } },
          serverEventsByCharacter: { '1': ['incursionNearby'] },
          routeRules: { preference: 'shortest', securityPenalty: 50, avoid: [NEW_CALDARI] },
        }),
      ],
      state: {
        phone: {
          characters: {
            '1': { incursion: { frame: { originSystemId: JITA, withinJumps: 1 }, inRange: [] } },
          },
          pushed: {},
        },
      },
    });
    expect((await run(s)).pushesSent).toBe(1);
  });

  it('keeps a transient send failure retryable: state is not written', async () => {
    const s = setup({
      state: { phone: { characters: { '1': quietBaseline }, pushed: {} } },
      send: async () => {
        throw Object.assign(new Error('unavailable'), { code: 'messaging/internal-error' });
      },
    });
    await run(s);
    expect(s.store.writeState).not.toHaveBeenCalled();
  });

  it('writes nothing when nothing changed', async () => {
    const s = setup({});
    await run(s);
    s.store.writeState.mockClear();
    await run(s);
    expect(s.store.writeState).not.toHaveBeenCalled();
  });

  it('deletes a device whose FCM token is dead', async () => {
    const s = setup({
      state: { phone: { characters: { '1': quietBaseline }, pushed: {} } },
      send: async () => {
        throw Object.assign(new Error('gone'), {
          code: 'messaging/registration-token-not-registered',
        });
      },
    });
    await run(s);
    expect(s.store.deleteDevice).toHaveBeenCalledWith('phone');
    expect(s.store.writeState).not.toHaveBeenCalled();
  });

  it('keeps the stored state for a list that could not be read', async () => {
    const s = setup({
      incursions: null,
      state: { phone: { characters: { '1': quietBaseline }, pushed: {} } },
    });
    await run(s);
    expect(s.states.phone.characters['1'].incursion).toEqual(quietBaseline.incursion);
  });

  it('drops state for a Character not located this run', async () => {
    const s = setup({
      state: { phone: { characters: { '1': quietBaseline, '99': quietBaseline }, pushed: {} } },
    });
    await run(s);
    expect(Object.keys(s.states.phone.characters)).toEqual(['1']);
  });

  it('does nothing without a located Character', async () => {
    const s = setup({});
    await run(s, new Map());
    expect(s.store.devicesFor).not.toHaveBeenCalled();
  });

  it('stops before the lists when the shared error budget is spent', async () => {
    const s = setup({ state: { phone: { characters: { '1': quietBaseline }, pushed: {} } } });
    s.deps.fetchIncursions = vi.fn(async () => ({ kind: 'backoff' as const, retryAfterMs: null }));
    const result = await run(s);
    expect(result.budgetStopped).toBe(true);
    expect(s.deps.fetchRaidableSkyhooks).not.toHaveBeenCalled();
    expect(s.store.writeState).not.toHaveBeenCalled();
  });

  it('leaves a dormant registration alone (issue #5144)', async () => {
    const s = setup({ devices: [{ ...device(), updatedAtMs: NOW - 120 * 24 * 3_600_000 }] });
    const result = await run(s);
    expect(result.pushesSent).toBe(0);
    expect(s.deps.fetchIncursions).not.toHaveBeenCalled();
    expect(s.store.writeState).not.toHaveBeenCalled();
  });
});
