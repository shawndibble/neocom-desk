import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { courierDeliveryDeadlineMs } from './courierDeadline';

const base = {
  contract_id: 1,
  type: 'courier',
  status: 'in_progress',
  date_issued: '2026-09-01T00:00:00Z',
  date_expired: '2026-09-30T00:00:00Z',
  date_accepted: '2026-09-10T12:00:00Z',
  days_to_complete: 3,
} as unknown as Contract;

describe('courierDeliveryDeadlineMs', () => {
  it('is date_accepted plus days_to_complete', () => {
    expect(courierDeliveryDeadlineMs(base)).toBe(Date.parse('2026-09-13T12:00:00Z'));
  });

  it('is null for non-couriers', () => {
    expect(courierDeliveryDeadlineMs({ ...base, type: 'item_exchange' })).toBeNull();
  });

  it('is null unless in progress', () => {
    expect(courierDeliveryDeadlineMs({ ...base, status: 'outstanding' })).toBeNull();
    expect(courierDeliveryDeadlineMs({ ...base, status: 'finished' })).toBeNull();
  });

  it('is null for a missing, zero, or non-finite completion window', () => {
    expect(courierDeliveryDeadlineMs({ ...base, days_to_complete: undefined })).toBeNull();
    expect(courierDeliveryDeadlineMs({ ...base, days_to_complete: 0 })).toBeNull();
    expect(courierDeliveryDeadlineMs({ ...base, days_to_complete: NaN })).toBeNull();
  });

  it('is null without a parseable accepted date', () => {
    expect(courierDeliveryDeadlineMs({ ...base, date_accepted: undefined })).toBeNull();
    expect(courierDeliveryDeadlineMs({ ...base, date_accepted: 'nope' })).toBeNull();
  });
});
