import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { summarizeContractsBoard } from './contractsBoard';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const ME = 90000001;
const H = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();

function contract(over: Partial<Contract>): Contract {
  return {
    contract_id: 1,
    issuer_id: ME,
    issuer_corporation_id: 1,
    assignee_id: 0,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: iso(NOW - 24 * H),
    date_expired: iso(NOW + 10 * 24 * H),
    ...over,
  } as Contract;
}

const courier = (over: Partial<Contract>) =>
  contract({
    type: 'courier',
    status: 'in_progress',
    issuer_id: 42,
    acceptor_id: ME,
    date_accepted: iso(NOW - H),
    days_to_complete: 1,
    ...over,
  });

describe('summarizeContractsBoard', () => {
  it('counts outstanding item exchanges the pilot issued or was sent, whatever their expiry', () => {
    const summary = summarizeContractsBoard(
      [
        contract({ contract_id: 1 }),
        contract({ contract_id: 2, issuer_id: 42, assignee_id: ME }),
        contract({ contract_id: 3, issuer_id: 42 }),
        contract({ contract_id: 4, for_corporation: true }),
        contract({ contract_id: 5, status: 'finished' }),
      ],
      ME,
      NOW
    );
    expect(summary.exchanges).toBe(2);
  });

  it('rows list hauls in progress first, then outstanding contracts of any type, none expired', () => {
    const s = summarizeContractsBoard(
      [
        contract({ contract_id: 1, date_expired: iso(NOW + 9 * 24 * H) }),
        courier({ contract_id: 2, days_to_complete: 7 }),
        contract({ contract_id: 3, type: 'courier', date_expired: iso(NOW + 2 * H) }),
        contract({ contract_id: 4, date_expired: iso(NOW - H) }),
        contract({ contract_id: 5, issuer_id: 42 }),
      ],
      ME,
      NOW
    );
    expect(s.outstanding).toBe(2);
    expect(s.rows.map((r) => [r.contractId, r.state])).toEqual([
      [2, 'in_progress'],
      [3, 'outstanding'],
      [1, 'outstanding'],
    ]);
    expect(s.rows[1]?.kind).toBe('courier');
  });

  it('is empty with nothing qualifying', () => {
    expect(summarizeContractsBoard([], ME, NOW)).toEqual({
      inProgress: 0,
      exchanges: 0,
      outstanding: 0,
      dueSoon: 0,
      overdue: 0,
      soonest: null,
      items: [],
      rows: [],
    });
  });

  it('counts an in-progress courier by its deliver-by, not the offer expiry', () => {
    const s = summarizeContractsBoard([courier({ contract_id: 5 })], ME, NOW);
    expect(s.inProgress).toBe(1);
    expect(s.dueSoon).toBe(1);
    expect(s.overdue).toBe(0);
    expect(s.soonest).toMatchObject({ contractId: 5, kind: 'courier', atMs: NOW + 23 * H });
  });

  it('lists each contract on a clock, soonest first, with what the Table view needs', () => {
    const rows = [
      contract({ contract_id: 8, title: 'Mine', price: 5, date_expired: iso(NOW + 3 * H) }),
      courier({
        contract_id: 9,
        title: 'Hull haul',
        reward: 2_000_000,
        collateral: 90_000_000,
        start_location_id: 60003760,
        end_location_id: 60008494,
      }),
      contract({ contract_id: 10, date_expired: iso(NOW + 9 * 24 * H) }),
    ];
    const { items } = summarizeContractsBoard(rows, ME, NOW);
    expect(items.map((i) => i.contractId)).toEqual([8, 9]);
    expect(items[0]).toMatchObject({ kind: 'listing', title: 'Mine', price: 5 });
    expect(items[1]).toMatchObject({
      kind: 'courier',
      reward: 2_000_000,
      collateral: 90_000_000,
      startLocationId: 60003760,
      endLocationId: 60008494,
    });
  });

  it('ignores a courier the pilot issued that someone else is hauling', () => {
    const s = summarizeContractsBoard([courier({ issuer_id: ME, acceptor_id: 999 })], ME, NOW);
    expect(s.inProgress).toBe(0);
    expect(s.soonest).toBeNull();
  });

  it('counts a courier due beyond 24h as in progress but not due soon', () => {
    const s = summarizeContractsBoard([courier({ days_to_complete: 7 })], ME, NOW);
    expect(s.inProgress).toBe(1);
    expect(s.dueSoon).toBe(0);
    expect(s.soonest?.kind).toBe('courier');
  });

  it('flags a courier past its deliver-by as overdue and soonest', () => {
    const late = courier({ contract_id: 7, date_accepted: iso(NOW - 30 * H) });
    const s = summarizeContractsBoard([courier({ contract_id: 8 }), late], ME, NOW);
    expect(s.overdue).toBe(1);
    expect(s.soonest).toMatchObject({ contractId: 7, overdue: true });
  });

  it('falls back to the offer expiry when the deliver-by cannot be derived', () => {
    const c = courier({ days_to_complete: 0, date_expired: iso(NOW + 5 * H) });
    expect(summarizeContractsBoard([c], ME, NOW).soonest?.atMs).toBe(NOW + 5 * H);
  });

  it('includes own outstanding listings expiring within 24h only', () => {
    const inside = contract({ contract_id: 2, date_expired: iso(NOW + 23 * H + 59 * 60_000) });
    const outside = contract({ contract_id: 3, date_expired: iso(NOW + 24 * H + 60_000) });
    const s = summarizeContractsBoard([inside, outside], ME, NOW);
    expect(s.dueSoon).toBe(1);
    expect(s.inProgress).toBe(0);
    expect(s.soonest).toMatchObject({ contractId: 2, kind: 'listing' });
  });

  it('leaves a trader with only long-dated listings at nothing due', () => {
    const listings = Array.from({ length: 12 }, (_, i) =>
      contract({ contract_id: 100 + i, date_expired: iso(NOW + (5 + i) * 24 * H) })
    );
    expect(summarizeContractsBoard(listings, ME, NOW).soonest).toBeNull();
  });

  it('ignores already-expired, corporation and other-issuer outstanding contracts', () => {
    const rows = [
      contract({ contract_id: 1, date_expired: iso(NOW - H) }),
      contract({ contract_id: 2, date_expired: iso(NOW + H), for_corporation: true }),
      contract({ contract_id: 3, date_expired: iso(NOW + H), issuer_id: 999 }),
    ];
    expect(summarizeContractsBoard(rows, ME, NOW).soonest).toBeNull();
  });

  it('picks the soonest across couriers and listings', () => {
    const listing = contract({ contract_id: 2, date_expired: iso(NOW + 3 * H) });
    const s = summarizeContractsBoard([courier({ contract_id: 1 }), listing], ME, NOW);
    expect(s.soonest).toMatchObject({ contractId: 2, kind: 'listing' });
  });
});
