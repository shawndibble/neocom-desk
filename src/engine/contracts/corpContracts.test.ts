import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { summarizeCorpContracts } from './corpContracts';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

const contract = (id: number, over: Partial<Contract> = {}): Contract => ({
  contract_id: id,
  issuer_id: 1,
  issuer_corporation_id: 9,
  assignee_id: 9,
  acceptor_id: 0,
  type: 'courier',
  status: 'outstanding',
  for_corporation: true,
  availability: 'personal',
  date_issued: iso(NOW - 24 * HOUR),
  date_expired: iso(NOW + 72 * HOUR),
  ...over,
});

describe('summarizeCorpContracts', () => {
  it('counts outstanding and in-progress courier and item-exchange contracts only', () => {
    const summary = summarizeCorpContracts(
      [
        contract(1),
        contract(2, { type: 'item_exchange' }),
        contract(3, { status: 'in_progress', days_to_complete: 7, date_accepted: iso(NOW) }),
        contract(4, { status: 'finished' }),
        contract(5, { type: 'auction' }),
        contract(6, { type: 'loan' }),
      ],
      NOW
    );
    expect(summary.rows.map((r) => r.contractId).sort()).toEqual([1, 2, 3]);
    expect(summary.outstanding).toBe(3);
  });

  it('drops an offer whose expiry has passed: stale, not outstanding', () => {
    const summary = summarizeCorpContracts([contract(1, { date_expired: iso(NOW - HOUR) })], NOW);
    expect(summary.outstanding).toBe(0);
    expect(summary.rows).toEqual([]);
  });

  it('counts a contract expiring inside 24 h, and an overdue haul, as expiring soon', () => {
    const summary = summarizeCorpContracts(
      [
        contract(1, { date_expired: iso(NOW + 5 * HOUR) }),
        contract(2),
        contract(3, {
          status: 'in_progress',
          days_to_complete: 1,
          date_accepted: iso(NOW - 48 * HOUR),
          date_expired: iso(NOW + 100 * HOUR),
        }),
      ],
      NOW
    );
    expect(summary.expiringSoon).toBe(2);
    // The overdue haul's deliver-by, not its offer expiry, and soonest first.
    expect(summary.rows.map((r) => r.contractId)).toEqual([3, 1, 2]);
    expect(summary.rows[0]).toMatchObject({ overdue: true, expiringSoon: true });
  });

  it('sums the collateral at stake across couriers', () => {
    const summary = summarizeCorpContracts(
      [
        contract(1, { collateral: 500 }),
        contract(2, { status: 'in_progress', collateral: 250, date_accepted: iso(NOW) }),
        contract(3, { type: 'item_exchange', price: 99 }),
      ],
      NOW
    );
    expect(summary.collateral).toBe(750);
  });
});
