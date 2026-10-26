import { describe, expect, it } from 'vitest';
import { ALERTS_LOCATION_SCOPE, ALERTS_MAIL_SCOPE, ALERTS_SCOPE } from './alertGrant.js';
import {
  FRESH_DEVICE_MS,
  POLL_RUN_MS,
  deviceCadence,
  FULL_LISTING_RUN,
  IDLE_RECHECK_RUNS,
  isFullListingRun,
  liveDevices,
  nextPollAtMs,
  planGrant,
  wakeCutoffMs,
} from './pollerEfficiency.js';
import { ACCOUNT_INACTIVITY_MS } from './purgeStaleAccounts.js';

const DAY = 24 * 3_600_000;
// A run that lands on the hourly slot (floor(now / 15 min) % 4 === 0), and one that does not.
const HOURLY_RUN = 4 * 1000 * POLL_RUN_MS;
const OFF_RUN = HOURLY_RUN + POLL_RUN_MS;

describe('deviceCadence', () => {
  it('polls a fresh or undated registration every run', () => {
    expect(deviceCadence(undefined, OFF_RUN)).toBe('due');
    expect(deviceCadence(null, OFF_RUN)).toBe('due');
    expect(deviceCadence(OFF_RUN - FRESH_DEVICE_MS, OFF_RUN)).toBe('due');
  });

  it('polls a stale registration only on the hourly run', () => {
    const stale = (now: number) => now - FRESH_DEVICE_MS - 1;
    expect(deviceCadence(stale(HOURLY_RUN), HOURLY_RUN)).toBe('due');
    expect(deviceCadence(stale(OFF_RUN), OFF_RUN)).toBe('sleeping');
    expect(deviceCadence(stale(OFF_RUN + POLL_RUN_MS), OFF_RUN + POLL_RUN_MS)).toBe('sleeping');
    expect(deviceCadence(stale(HOURLY_RUN + 4 * POLL_RUN_MS), HOURLY_RUN + 4 * POLL_RUN_MS)).toBe(
      'due'
    );
  });

  it('stops polling at the account inactivity window (purgeStaleAccounts)', () => {
    expect(deviceCadence(HOURLY_RUN - ACCOUNT_INACTIVITY_MS, HOURLY_RUN)).toBe('due');
    expect(deviceCadence(HOURLY_RUN - ACCOUNT_INACTIVITY_MS - 1, HOURLY_RUN)).toBe('dormant');
    expect(deviceCadence(OFF_RUN - 200 * DAY, OFF_RUN)).toBe('dormant');
  });
});

const grant = (scopes: string[] = [ALERTS_SCOPE], seenTypes = ['WarDeclared']) => ({
  scopes,
  seenTypes,
});
const device = (over: Partial<Parameters<typeof planGrant>[1][number]> = {}) => ({
  eveTypes: [] as string[],
  serverEvents: [] as string[],
  ...over,
});

describe('planGrant', () => {
  it('polls a grant a fresh device has a type enabled for, reading notifications only', () => {
    const plan = planGrant(grant(), [device({ eveTypes: ['WarDeclared'] })], OFF_RUN);
    expect(plan.action).toBe('poll');
    expect(plan.call).toEqual({ notifications: true, mail: false, nearby: false });
  });

  it('is idle when no device wants anything the grant covers', () => {
    const plan = planGrant(
      grant([ALERTS_SCOPE, ALERTS_MAIL_SCOPE]),
      [device({ serverEvents: ['priceAlertTriggered'] })],
      OFF_RUN
    );
    expect(plan.action).toBe('idle');
    expect(plan.idle).toEqual({ notifications: true, mail: true, nearby: false });
  });

  it('ignores events the grant has no scope for', () => {
    const plan = planGrant(
      grant(),
      [device({ serverEvents: ['newMail', 'incursionNearby'] })],
      OFF_RUN
    );
    expect(plan.action).toBe('idle');
  });

  it('reads mail and location only for the scope and device that want them', () => {
    const plan = planGrant(
      grant([ALERTS_SCOPE, ALERTS_MAIL_SCOPE, ALERTS_LOCATION_SCOPE]),
      [device({ serverEvents: ['newMail'] }), device({ serverEvents: ['skyhookRaidableNearby'] })],
      OFF_RUN
    );
    expect(plan).toMatchObject({
      action: 'poll',
      call: { notifications: false, mail: true, nearby: true },
      idle: { notifications: true, mail: false },
    });
  });

  it('reads a grant that has seen no type yet once, so its toggles can appear', () => {
    expect(planGrant(grant([ALERTS_SCOPE], []), [device()], OFF_RUN).call.notifications).toBe(true);
    expect(planGrant(grant([ALERTS_SCOPE], []), [], OFF_RUN).action).toBe('idle');
  });

  it('backs off when only a sleeping device wants it, without calling it idle', () => {
    const old = OFF_RUN - FRESH_DEVICE_MS - 1;
    const plan = planGrant(
      grant(),
      [device({ eveTypes: ['WarDeclared'], updatedAtMs: old })],
      OFF_RUN
    );
    expect(plan.action).toBe('backoff');
    expect(plan.idle.notifications).toBe(false);
    expect(
      planGrant(grant(), [device({ eveTypes: ['WarDeclared'], updatedAtMs: old })], HOURLY_RUN)
        .action
    ).toBe('poll');
  });

  it('treats a dormant device as wanting nothing, so its grant goes idle', () => {
    const dormant = OFF_RUN - ACCOUNT_INACTIVITY_MS - 1;
    const plan = planGrant(
      grant(),
      [device({ eveTypes: ['WarDeclared'], updatedAtMs: dormant })],
      OFF_RUN
    );
    expect(plan).toMatchObject({ action: 'idle', dormant: 1, live: 0 });
  });

  it('polls for a fresh device while a sleeping one is among the pushes', () => {
    const old = OFF_RUN - FRESH_DEVICE_MS - 1;
    const devices = [
      device({ eveTypes: ['WarDeclared'] }),
      device({ eveTypes: ['WarDeclared'], updatedAtMs: old }),
    ];
    expect(planGrant(grant(), devices, OFF_RUN)).toMatchObject({
      action: 'poll',
      live: 2,
      sleeping: 1,
    });
  });
});

describe('liveDevices', () => {
  it('drops only the dormant', () => {
    const dormant = OFF_RUN - ACCOUNT_INACTIVITY_MS - 1;
    const kept = liveDevices(
      [{ updatedAtMs: dormant }, { updatedAtMs: OFF_RUN - FRESH_DEVICE_MS - 1 }, {}],
      OFF_RUN
    );
    expect(kept).toHaveLength(2);
  });
});

describe('wakeCutoffMs', () => {
  it('resumes from the earliest wanting registration, or now without a stamp', () => {
    expect(wakeCutoffMs([{ updatedAtMs: 500 }, { updatedAtMs: 300 }], 1000)).toBe(300);
    expect(wakeCutoffMs([{ updatedAtMs: 500 }, {}], 1000)).toBe(1000);
    expect(wakeCutoffMs([{ updatedAtMs: 5000 }], 1000)).toBe(1000);
    expect(wakeCutoffMs([], 1000)).toBe(1000);
  });
});

describe('nextPollAtMs', () => {
  const grant = { seenTypes: ['T'] };
  const wants = { eveTypes: ['T'] };
  const stale = { ...wants, updatedAtMs: OFF_RUN - FRESH_DEVICE_MS - 1 };

  it('is the next run for a fresh wanting device', () => {
    expect(nextPollAtMs(grant, [wants], OFF_RUN)).toBe(
      OFF_RUN - (OFF_RUN % POLL_RUN_MS) + POLL_RUN_MS
    );
  });

  it('is the next hourly slot for a slow-cadence device', () => {
    const next = nextPollAtMs(grant, [stale], OFF_RUN);
    expect(next).toBeGreaterThan(OFF_RUN);
    expect((next / POLL_RUN_MS) % 4).toBe(0);
    expect(next - OFF_RUN).toBeLessThanOrEqual(4 * POLL_RUN_MS);
  });

  it('waits IDLE_RECHECK_RUNS, on an hourly slot, when nobody wants anything', () => {
    const next = nextPollAtMs(grant, [{ eveTypes: [] }], OFF_RUN);
    expect((next / POLL_RUN_MS) % 4).toBe(0);
    expect(next - OFF_RUN).toBeGreaterThanOrEqual((IDLE_RECHECK_RUNS - 1) * POLL_RUN_MS);
    expect(next - OFF_RUN).toBeLessThanOrEqual((IDLE_RECHECK_RUNS + 3) * POLL_RUN_MS);
  });
});

describe('isFullListingRun', () => {
  it('is one run a day', () => {
    expect(isFullListingRun((96 * 5 + FULL_LISTING_RUN) * POLL_RUN_MS + 1000)).toBe(true);
    expect(isFullListingRun((96 * 5 + FULL_LISTING_RUN + 1) * POLL_RUN_MS)).toBe(false);
  });
});
