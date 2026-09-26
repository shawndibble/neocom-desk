import { describe, it, expect } from 'vitest';
import {
  diffCourierDeliveryDue,
  type ContractEntrySnapshot,
  type ContractNotificationFire,
} from './notificationDiffs';
import { occurrenceKey, occurrenceFiredAt } from './occurrenceKey';
import { projectContracts, projectionWording, PROJECTION_HORIZON_MS } from './projection';

const HOUR = 3_600_000;
const T0 = 1_800_000_000_000;
const ME = 42;
const LEAD = 6 * HOUR;

function entry(overrides: Partial<ContractEntrySnapshot> = {}): ContractEntrySnapshot {
  return {
    contractId: 9,
    status: 'in_progress',
    issuerId: 1,
    acceptorId: ME,
    deliveryDeadlineMs: T0 + 10 * HOUR,
    dueLeadMs: LEAD,
    ...overrides,
  };
}

const snap = (nowMs: number, ...entries: ContractEntrySnapshot[]) => ({ entries, nowMs });

describe('diffCourierDeliveryDue', () => {
  it('fires nothing without a baseline', () => {
    expect(diffCourierDeliveryDue(ME, undefined, snap(T0 + 8 * HOUR, entry()))).toEqual([]);
  });

  it('fires once when the deadline enters the lead window', () => {
    const prev = snap(T0, entry());
    const next = snap(T0 + 5 * HOUR, entry());
    expect(diffCourierDeliveryDue(ME, prev, next)).toEqual([
      {
        eventId: 'courierDeliveryDue',
        characterId: ME,
        contractId: 9,
        deadlineMs: T0 + 10 * HOUR,
        thresholdMs: LEAD,
      },
    ]);
  });

  it('does not re-fire while it stays inside the window', () => {
    const prev = snap(T0 + 5 * HOUR, entry());
    const next = snap(T0 + 6 * HOUR, entry());
    expect(diffCourierDeliveryDue(ME, prev, next)).toEqual([]);
  });

  it('fires nothing while the deadline is still outside the window', () => {
    expect(diffCourierDeliveryDue(ME, snap(T0, entry()), snap(T0 + HOUR, entry()))).toEqual([]);
  });

  it('fires nothing once the deadline has passed — contractFailed reports that', () => {
    const next = snap(T0 + 11 * HOUR, entry());
    expect(diffCourierDeliveryDue(ME, snap(T0 + 3 * HOUR, entry()), next)).toEqual([]);
  });

  it('fires for a contract first observed already inside the window', () => {
    const next = snap(T0 + 8 * HOUR, entry());
    expect(diffCourierDeliveryDue(ME, snap(T0, entry({ contractId: 1 })), next)).toHaveLength(1);
  });

  it('re-fires when the lead time is raised past the remaining time', () => {
    const prev = snap(T0 + 8 * HOUR, entry({ dueLeadMs: HOUR }));
    const next = snap(T0 + 8.5 * HOUR, entry({ dueLeadMs: 6 * HOUR }));
    expect(diffCourierDeliveryDue(ME, prev, next)).toHaveLength(1);
  });

  it('ignores contracts the character did not accept, and ones that are not in progress', () => {
    const prev = snap(T0);
    const next = snap(
      T0 + 8 * HOUR,
      entry({ contractId: 1, acceptorId: 7 }),
      entry({ contractId: 2, status: 'finished' })
    );
    expect(diffCourierDeliveryDue(ME, prev, next)).toEqual([]);
  });

  it('ignores an entry with no deadline or no recorded lead time', () => {
    const prev = snap(T0);
    const next = snap(
      T0 + 8 * HOUR,
      entry({ contractId: 1, deliveryDeadlineMs: undefined }),
      entry({ contractId: 2, dueLeadMs: undefined })
    );
    expect(diffCourierDeliveryDue(ME, prev, next)).toEqual([]);
  });
});

describe('courierDeliveryDue occurrence key', () => {
  const fire: ContractNotificationFire = {
    eventId: 'courierDeliveryDue',
    characterId: ME,
    contractId: 9,
    deadlineMs: T0,
    thresholdMs: LEAD,
  };

  it('differs per contract, deadline and threshold', () => {
    const key = occurrenceKey(fire, 0);
    expect(occurrenceKey({ ...fire, contractId: 10 }, 0)).not.toBe(key);
    expect(occurrenceKey({ ...fire, thresholdMs: HOUR }, 0)).not.toBe(key);
    expect(occurrenceKey({ ...fire, deadlineMs: T0 + 1 }, 0)).not.toBe(key);
  });

  it('is stamped at the moment observed, not the deadline', () => {
    expect(occurrenceFiredAt(fire, 123)).toBe(123);
  });
});

describe('projectContracts', () => {
  const copy = () => ({ title: 't', body: 'b' });

  it('hedges its wording', () => {
    expect(projectionWording('courierDeliveryDue')).toBe('hedge');
  });

  it('projects one row at deadline minus lead time', () => {
    const rows = projectContracts(ME, 'Kestrel', [entry()], copy, T0);
    expect(rows).toHaveLength(1);
    expect(rows[0].eventId).toBe('courierDeliveryDue');
    expect(rows[0].fireAt).toBe(T0 + 4 * HOUR);
  });

  it('skips rows outside the horizon, in the past, foreign, or without a deadline', () => {
    const far = entry({ contractId: 1, deliveryDeadlineMs: T0 + PROJECTION_HORIZON_MS + 7 * HOUR });
    const past = entry({ contractId: 2, deliveryDeadlineMs: T0 + HOUR });
    const foreign = entry({ contractId: 3, acceptorId: 7 });
    const none = entry({ contractId: 4, deliveryDeadlineMs: undefined });
    expect(projectContracts(ME, 'Kestrel', [far, past, foreign, none], copy, T0)).toEqual([]);
  });
});
