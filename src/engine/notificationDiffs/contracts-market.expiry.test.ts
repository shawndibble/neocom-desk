import { describe, it, expect } from 'vitest';
import {
  diffContractExpiring,
  diffOrdersLapsing,
  type ContractEntrySnapshot,
  type ContractNotificationFire,
  type OrderExpiryEntrySnapshot,
  type OrdersLapsingFire,
} from './index';
import { occurrenceKey, occurrenceFiredAt } from '../occurrenceKey';
import {
  projectContracts,
  projectOrdersLapsing,
  projectionWording,
  PROJECTION_HORIZON_MS,
} from '../projection';

const HOUR = 3_600_000;
const T0 = 1_800_000_000_000;
const ME = 42;
const LEAD = 12 * HOUR;

function contract(overrides: Partial<ContractEntrySnapshot> = {}): ContractEntrySnapshot {
  return {
    contractId: 9,
    status: 'outstanding',
    issuerId: ME,
    acceptorId: 0,
    expiresMs: T0 + 20 * HOUR,
    expiringLeadMs: LEAD,
    ...overrides,
  };
}
const csnap = (nowMs: number, ...entries: ContractEntrySnapshot[]) => ({ entries, nowMs });

describe('diffContractExpiring', () => {
  it('fires nothing without a baseline', () => {
    expect(diffContractExpiring(ME, undefined, csnap(T0 + 10 * HOUR, contract()))).toEqual([]);
  });

  it('fires once when the expiry enters the lead window', () => {
    const fires = diffContractExpiring(
      ME,
      csnap(T0, contract()),
      csnap(T0 + 10 * HOUR, contract())
    );
    expect(fires).toEqual([
      {
        eventId: 'contractExpiring',
        characterId: ME,
        contractId: 9,
        deadlineMs: T0 + 20 * HOUR,
        thresholdMs: LEAD,
      },
    ]);
  });

  it('does not re-fire while it stays inside the window', () => {
    const prev = csnap(T0 + 10 * HOUR, contract());
    expect(diffContractExpiring(ME, prev, csnap(T0 + 11 * HOUR, contract()))).toEqual([]);
  });

  it('fires nothing outside the window or after expiry', () => {
    expect(diffContractExpiring(ME, csnap(T0, contract()), csnap(T0 + HOUR, contract()))).toEqual(
      []
    );
    expect(
      diffContractExpiring(ME, csnap(T0, contract()), csnap(T0 + 21 * HOUR, contract()))
    ).toEqual([]);
  });

  it('ignores accepted, deleted, foreign-issued and unwindowed contracts', () => {
    const next = csnap(
      T0 + 10 * HOUR,
      contract({ contractId: 1, status: 'in_progress' }),
      contract({ contractId: 2, status: 'deleted' }),
      contract({ contractId: 3, status: 'finished' }),
      contract({ contractId: 4, issuerId: 7 }),
      contract({ contractId: 5, expiresMs: undefined }),
      contract({ contractId: 6, expiringLeadMs: undefined })
    );
    expect(diffContractExpiring(ME, csnap(T0), next)).toEqual([]);
  });

  it('re-fires when the lead time is raised past the remaining time', () => {
    const prev = csnap(T0 + 10 * HOUR, contract({ expiringLeadMs: HOUR }));
    const next = csnap(T0 + 10.5 * HOUR, contract({ expiringLeadMs: 12 * HOUR }));
    expect(diffContractExpiring(ME, prev, next)).toHaveLength(1);
  });
});

describe('contractExpiring occurrence key and projection', () => {
  const fire: ContractNotificationFire = {
    eventId: 'contractExpiring',
    characterId: ME,
    contractId: 9,
    deadlineMs: T0,
    thresholdMs: LEAD,
  };
  const copy = () => ({ title: 't', body: 'b' });

  it('differs per contract, expiry and threshold', () => {
    const key = occurrenceKey(fire, 0);
    expect(occurrenceKey({ ...fire, contractId: 10 }, 0)).not.toBe(key);
    expect(occurrenceKey({ ...fire, thresholdMs: HOUR }, 0)).not.toBe(key);
    expect(occurrenceKey({ ...fire, deadlineMs: T0 + 1 }, 0)).not.toBe(key);
    expect(occurrenceFiredAt(fire, 123)).toBe(123);
  });

  it('hedges, and projects one row at expiry minus lead time', () => {
    expect(projectionWording('contractExpiring')).toBe('hedge');
    const rows = projectContracts(ME, 'Kestrel', [contract()], copy, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe('contractExpiring');
    expect(rows[0].fireAt).toBe(T0 + 8 * HOUR);
  });

  it('skips rows outside the horizon, past, foreign or accepted', () => {
    const far = contract({ contractId: 1, expiresMs: T0 + PROJECTION_HORIZON_MS + 13 * HOUR });
    const past = contract({ contractId: 2, expiresMs: T0 + HOUR });
    const foreign = contract({ contractId: 3, issuerId: 7 });
    const accepted = contract({ contractId: 4, status: 'in_progress' });
    expect(projectContracts(ME, 'Kestrel', [far, past, foreign, accepted], copy, T0)).toEqual([]);
  });
});

function order(orderId: number, expiresMs: number, leadMs = LEAD): OrderExpiryEntrySnapshot {
  return { orderId, expiresMs, leadMs };
}
const osnap = (nowMs: number, ...entries: OrderExpiryEntrySnapshot[]) => ({ entries, nowMs });

describe('diffOrdersLapsing', () => {
  const orders = [order(1, T0 + 20 * HOUR), order(2, T0 + 20 * HOUR), order(3, T0 + 21 * HOUR)];

  it('fires nothing without a baseline', () => {
    expect(diffOrdersLapsing(ME, undefined, osnap(T0 + 10 * HOUR, ...orders))).toEqual([]);
  });

  it('batches every order inside the window into one fire', () => {
    expect(diffOrdersLapsing(ME, osnap(T0, ...orders), osnap(T0 + 10 * HOUR, ...orders))).toEqual([
      {
        eventId: 'ordersLapsing',
        characterId: ME,
        count: 3,
        soonestMs: T0 + 20 * HOUR,
        thresholdMs: LEAD,
      },
    ]);
  });

  it('does not re-fire while the same batch is still warned about, even as more orders enter', () => {
    const prev = osnap(T0 + 8.5 * HOUR, ...orders);
    const next = osnap(T0 + 9.5 * HOUR, ...orders);
    expect(diffOrdersLapsing(ME, prev, next)).toEqual([]);
  });

  it('counts only the batch lapsing within an hour of the soonest', () => {
    const staggered = [
      order(1, T0 + 20 * HOUR),
      order(2, T0 + 20.5 * HOUR),
      order(3, T0 + 30 * HOUR),
    ];
    const fires = diffOrdersLapsing(
      ME,
      osnap(T0, ...staggered),
      osnap(T0 + 19 * HOUR, ...staggered)
    );
    expect(fires.map((f) => f.count)).toEqual([2]);
  });

  it('gives staggered orders their own alert once the earlier batch has lapsed', () => {
    const a = order(1, T0 + 20 * HOUR);
    const b = order(2, T0 + 40 * HOUR);
    const prev = osnap(T0 + 19 * HOUR, a, b);
    const next = osnap(T0 + 30 * HOUR, b);
    expect(diffOrdersLapsing(ME, prev, next)).toEqual([
      expect.objectContaining({ count: 1, soonestMs: T0 + 40 * HOUR }),
    ]);
  });

  it('stays silent when the next order lapses within the batch window of the one warned about', () => {
    const a = order(1, T0 + 20 * HOUR);
    const b = order(2, T0 + 20.5 * HOUR);
    const next = osnap(T0 + 20.2 * HOUR, b);
    expect(diffOrdersLapsing(ME, osnap(T0 + 19 * HOUR, a, b), next)).toEqual([]);
  });

  it('fires nothing outside the window or once expired', () => {
    expect(diffOrdersLapsing(ME, osnap(T0, ...orders), osnap(T0 + HOUR, ...orders))).toEqual([]);
    expect(diffOrdersLapsing(ME, osnap(T0, ...orders), osnap(T0 + 25 * HOUR, ...orders))).toEqual(
      []
    );
  });
});

describe('ordersLapsing occurrence key and projection', () => {
  const fire: OrdersLapsingFire = {
    eventId: 'ordersLapsing',
    characterId: ME,
    count: 3,
    soonestMs: T0,
    thresholdMs: LEAD,
  };
  const copy = () => ({ title: 't', body: 'b' });

  it('keys on the soonest expiry and threshold, not the count', () => {
    const key = occurrenceKey(fire, 0);
    expect(occurrenceKey({ ...fire, count: 9 }, 0)).toBe(key);
    expect(occurrenceKey({ ...fire, soonestMs: T0 + 1 }, 0)).not.toBe(key);
    expect(occurrenceKey({ ...fire, thresholdMs: HOUR }, 0)).not.toBe(key);
    expect(occurrenceFiredAt(fire, 123)).toBe(123);
  });

  it('hedges, and projects one row per batch at its soonest expiry minus lead', () => {
    expect(projectionWording('ordersLapsing')).toBe('hedge');
    const rows = projectOrdersLapsing(
      ME,
      'Kestrel',
      [order(1, T0 + 20 * HOUR), order(2, T0 + 20 * HOUR), order(3, T0 + 30 * HOUR)],
      copy,
      T0
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].fireAt).toBe(T0 + 8 * HOUR);
    expect(rows[1].fireAt).toBe(T0 + 18 * HOUR);
  });

  it('projects nothing when the soonest fire time is past, outside the horizon, or no orders', () => {
    expect(projectOrdersLapsing(ME, 'K', [order(1, T0 + 5 * HOUR)], copy, T0)).toEqual([]);
    expect(
      projectOrdersLapsing(ME, 'K', [order(1, T0 + PROJECTION_HORIZON_MS + 13 * HOUR)], copy, T0)
    ).toEqual([]);
    expect(projectOrdersLapsing(ME, 'K', [], copy, T0)).toEqual([]);
  });
});
