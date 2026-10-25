import { describe, expect, it, vi } from 'vitest';
import {
  pollServerEvents,
  type LossRead,
  type PolledDevice,
  type ServerPollDeps,
} from './serverEventPoll.js';
import type { ServerEventBaseline, ShipLossEntry } from './serverEvents.js';

const NOW = Date.parse('2026-10-25T12:00:00Z');
const STATION = 60003760;

const alert = { typeId: 34, name: 'Tritanium', targetPrice: 10, direction: 'above' as const };

function device(
  overrides: Partial<PolledDevice> = {},
  baseline: ServerEventBaseline = {}
): PolledDevice {
  return {
    deviceId: 'A',
    fcmToken: 'token-A',
    characters: [
      {
        characterId: 7,
        events: ['priceAlertTriggered', 'shipLost'],
        inputs: { priceStationId: STATION, priceAlerts: [alert] },
        baseline,
      },
    ],
    ...overrides,
  };
}

const loss = (killmailId: number): ShipLossEntry => ({ killmailId, timeMs: NOW - 1000 });

function harness(
  devices: PolledDevice[],
  {
    price = 11 as number | null,
    pricesFail = false,
    losses = { kind: 'ok', losses: [loss(1), loss(2)] } as LossRead,
  } = {}
) {
  const sent: { token: string; data: Record<string, string> }[] = [];
  const saved = new Map<string, Record<string, ServerEventBaseline>>();
  const deps: ServerPollDeps = {
    listDevices: async () => devices,
    fetchLosses: vi.fn(async () => losses),
    fetchPrices: vi.fn(async (_station: number, typeIds: readonly number[]) =>
      pricesFail ? null : new Map(typeIds.map((id) => [id, price]))
    ),
    send: vi.fn(async (token: string, data: Record<string, string>) => {
      sent.push({ token, data });
    }),
    saveBaselines: vi.fn(
      async (deviceId: string, baselines: Record<string, ServerEventBaseline>) => {
        saved.set(deviceId, baselines);
      }
    ),
    deleteDevice: vi.fn(async () => {}),
    log: () => {},
    now: () => NOW,
    pause: async () => {},
  };
  return { deps, sent, saved };
}

describe('pollServerEvents', () => {
  it('seeds a first reading silently', async () => {
    const { deps, sent, saved } = harness([device()]);
    await pollServerEvents(deps);
    expect(sent).toEqual([]);
    expect(saved.get('A')).toEqual({
      '7': {
        priceAlerts: [{ ...alert, price: 11 }],
        shipLossIds: [1, 2],
      },
    });
  });

  it('pushes a crossing and a new loss, keyed like the Foreground Poller', async () => {
    const { deps, sent } = harness([
      device({}, { priceAlerts: [{ ...alert, price: 9 }], shipLossIds: [1] }),
    ]);
    const summary = await pollServerEvents(deps);
    expect(sent.map((s) => s.data.occurrenceKey)).toEqual([
      '7:priceAlertTriggered:34:10:above',
      '7:shipLost:2',
    ]);
    expect(sent.every((s) => s.token === 'token-A')).toBe(true);
    expect(summary.pushesSent).toBe(2);
  });

  it('reads each Character’s losses and each station’s prices once, however many devices hold them', async () => {
    const { deps } = harness([device(), device({ deviceId: 'B', fcmToken: 'token-B' })]);
    await pollServerEvents(deps);
    expect(deps.fetchLosses).toHaveBeenCalledTimes(1);
    expect(deps.fetchPrices).toHaveBeenCalledTimes(1);
  });

  it('reads nothing for an event the device did not enable', async () => {
    const d = device();
    d.characters[0].events = ['communityJoinRequest'];
    const { deps } = harness([d]);
    await pollServerEvents(deps);
    expect(deps.fetchLosses).not.toHaveBeenCalled();
    expect(deps.fetchPrices).not.toHaveBeenCalled();
  });

  it('keeps the last reading when a source fails, so the next good one is not a burst', async () => {
    const baseline = { priceAlerts: [{ ...alert, price: 9 }], shipLossIds: [1] };
    const { deps, sent, saved } = harness([device({}, baseline)], {
      pricesFail: true,
      losses: { kind: 'error' },
    });
    await pollServerEvents(deps);
    expect(sent).toEqual([]);
    expect(saved.get('A') ?? { '7': baseline }).toEqual({ '7': baseline });
  });

  it('stops reading zKillboard for the run once it asks to back off', async () => {
    const devices = [7, 8, 9].map((characterId) => ({
      deviceId: `D${characterId}`,
      fcmToken: `t${characterId}`,
      characters: [{ characterId, events: ['shipLost'], inputs: {}, baseline: {} }],
    }));
    const { deps } = harness(devices, { losses: { kind: 'backoff' } });
    const summary = await pollServerEvents(deps);
    expect(deps.fetchLosses).toHaveBeenCalledTimes(1);
    expect(summary.lossReadsStopped).toBe(true);
  });

  it('stops reading zKillboard once the run’s time budget is spent', async () => {
    const devices = [7, 8, 9].map((characterId) => ({
      deviceId: `D${characterId}`,
      fcmToken: `t${characterId}`,
      characters: [{ characterId, events: ['shipLost'], inputs: {}, baseline: {} }],
    }));
    const { deps } = harness(devices);
    let clock = NOW;
    deps.now = () => clock;
    deps.fetchLosses = vi.fn(async () => {
      clock += 400_000;
      return { kind: 'ok' as const, losses: [] };
    });
    const summary = await pollServerEvents(deps);
    expect(deps.fetchLosses).toHaveBeenCalledTimes(1);
    expect(summary.lossReadsStopped).toBe(true);
  });

  it('holds a push inside quiet time, but lets a loss through when attacks are allowed', async () => {
    const quietHours = { start: '00:00', end: '23:59', timeZone: 'UTC', allowAttacks: true };
    const { deps, sent, saved } = harness([
      device({ quietHours }, { priceAlerts: [{ ...alert, price: 9 }], shipLossIds: [1] }),
    ]);
    await pollServerEvents(deps);
    expect(sent.map((s) => s.data.eventId)).toEqual(['shipLost']);
    // Skipped, not queued: the reading still advances.
    expect(saved.get('A')?.['7'].priceAlerts?.[0].price).toBe(11);
  });

  it('deletes a dead device and keeps a transient failure’s reading for a retry', async () => {
    const baseline = { priceAlerts: [{ ...alert, price: 9 }], shipLossIds: [1] };
    const dead = harness([device({}, baseline)]);
    dead.deps.send = async () => {
      throw Object.assign(new Error('gone'), {
        code: 'messaging/registration-token-not-registered',
      });
    };
    await pollServerEvents(dead.deps);
    expect(dead.deps.deleteDevice).toHaveBeenCalledWith('A', 'token-A');
    expect(dead.saved.has('A')).toBe(false);

    const flaky = harness([device({}, baseline)]);
    flaky.deps.send = async () => {
      throw Object.assign(new Error('try later'), { code: 'messaging/internal-error' });
    };
    await pollServerEvents(flaky.deps);
    expect(flaky.saved.get('A') ?? { '7': baseline }).toEqual({ '7': baseline });
  });
});

describe('pollServerEvents: stale devices and run counts (issue #5144)', () => {
  const DAY = 24 * 3_600_000;
  const SLOT = 4_000 * 15 * 60_000; // the hourly slot of the back-off
  const stale = (days: number, at: number) => device({ updatedAtMs: at - days * DAY });
  const at = (now: number) => (d: ServerPollDeps) => ({ ...d, now: () => now });

  it('polls a stale device only on the hourly run', async () => {
    const off = harness([stale(20, SLOT + 900_000)]);
    await pollServerEvents(at(SLOT + 900_000)(off.deps));
    expect(off.deps.fetchLosses).not.toHaveBeenCalled();
    expect(off.saved.size).toBe(0);

    const hourly = harness([stale(20, SLOT)]);
    await pollServerEvents(at(SLOT)(hourly.deps));
    expect(hourly.deps.fetchLosses).toHaveBeenCalledTimes(1);
  });

  it('leaves a dormant device alone and forgets its readings once, so waking it seeds silently', async () => {
    const baseline = { shipLossIds: [1] };
    const dormant = harness([
      { ...stale(120, SLOT), characters: device({}, baseline).characters },
      device({ deviceId: 'B', updatedAtMs: SLOT }),
    ]);
    await pollServerEvents(at(SLOT)(dormant.deps));
    expect(dormant.deps.saveBaselines).toHaveBeenCalledWith('A', {});

    const cleared = harness([
      {
        ...stale(120, SLOT),
        characters: [{ ...device({}, baseline).characters[0]!, baseline: {} }],
      },
    ]);
    await pollServerEvents(at(SLOT)(cleared.deps));
    expect(cleared.deps.saveBaselines).not.toHaveBeenCalled();
    expect(cleared.deps.fetchLosses).not.toHaveBeenCalled();
  });

  it('counts the run', async () => {
    const { createRunStats, SERVER_POLL_STATS_KEYS } = await import('./runStats.js');
    const stats = createRunStats(SERVER_POLL_STATS_KEYS);
    const h = harness([device({ updatedAtMs: SLOT }), stale(20, SLOT + 900_000)]);
    await pollServerEvents({ ...h.deps, stats, now: () => SLOT + 900_000 });
    expect(stats.snapshot()).toMatchObject({
      devicesListed: 2,
      devicesPolled: 1,
      devicesSkippedSleeping: 1,
      devicesSkippedDormant: 0,
      zkillboardCalls: 1,
      fuzzworkCalls: 1,
      durationMs: 0,
    });
  });
});
