import { describe, expect, it } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { contractInteractions } from './contractInteractions';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key}|${JSON.stringify(opts)}` : key;
const ME = 1;
const OTHER = 900;
const NOW = Date.parse('2026-11-10T00:00:00Z');

const contract = (over: Partial<Contract>): Contract => ({
  contract_id: 77,
  issuer_id: ME,
  issuer_corporation_id: 5,
  assignee_id: OTHER,
  acceptor_id: 0,
  type: 'item_exchange',
  status: 'outstanding',
  for_corporation: false,
  availability: 'personal',
  date_issued: '2026-11-01T00:00:00Z',
  date_expired: '2026-12-01T00:00:00Z',
  ...over,
});

const run = (contracts: Contract[], locationNames = new Map<number, string>()) =>
  contractInteractions({ characterId: ME, otherId: OTHER, contracts, locationNames, now: NOW, t });

describe('contractInteractions', () => {
  it('links to the History tab where ?highlight= opens the contract', () => {
    const [row] = run([contract({})]);
    expect(row.to).toBe('/contracts/history?highlight=77');
    expect(row.id).toBe('contract-1-77');
    expect(row.kind).toBe('contract');
  });

  it('keeps only contracts between the viewer and the other player', () => {
    expect(run([contract({ assignee_id: 12345 })])).toEqual([]);
    expect(run([contract({ issuer_id: 5, assignee_id: 6 })])).toEqual([]);
    expect(run([contract({ issuer_id: OTHER, assignee_id: ME })])).toHaveLength(1);
    expect(run([contract({ assignee_id: 0, acceptor_id: OTHER })])).toHaveLength(1);
    expect(run([contract({ for_corporation: true })])).toEqual([]);
  });

  it('moves no ISK until the contract completes, then signs it from the viewer side', () => {
    expect(run([contract({ price: 100 })])[0].isk).toBeUndefined();
    const sold = run([
      contract({ price: 100, status: 'finished', date_completed: '2026-11-03T00:00:00Z' }),
    ])[0];
    expect(sold.isk).toBe(100);
    expect(sold.state).toBe('interactions.state.completed');
    expect(sold.stateTone).toBe('success');
    expect(sold.at).toBe(Date.parse('2026-11-03T00:00:00Z'));
    const bought = run([
      contract({ issuer_id: OTHER, assignee_id: ME, price: 100, status: 'finished' }),
    ])[0];
    expect(bought.isk).toBe(-100);
  });

  it('pays a courier reward to the acceptor and charges the issuer', () => {
    const base = {
      type: 'courier' as const,
      reward: 8_000_000,
      price: 0,
      status: 'finished' as const,
    };
    expect(run([contract(base)])[0].isk).toBe(-8_000_000);
    expect(run([contract({ ...base, issuer_id: OTHER, assignee_id: ME })])[0].isk).toBe(8_000_000);
  });

  it('titles a courier by route and volume', () => {
    const [row] = run(
      [contract({ type: 'courier', start_location_id: 1, end_location_id: 2, volume: 12400 })],
      new Map([
        [1, 'Jita IV-4'],
        [2, 'Efa VII'],
      ])
    );
    expect(row.type).toBe('interactions.type.courier');
    expect(row.title).toBe(
      'interactions.contract.courierTitle|{"from":"Jita IV-4","to":"Efa VII","volume":"12,400"}'
    );
  });

  it('titles an exchange by its own title, else a generic line', () => {
    expect(run([contract({ title: 'Rifter fit' })])[0].title).toBe('Rifter fit');
    expect(run([contract({})])[0].title).toBe('interactions.contract.itemExchangeTitle');
    expect(run([contract({ type: 'auction' })])[0].type).toBe('interactions.type.auction');
  });

  it('maps statuses to states', () => {
    const state = (c: Partial<Contract>) => run([contract(c)])[0]?.state;
    expect(state({ status: 'rejected' })).toBe('interactions.state.rejected');
    expect(state({ status: 'failed' })).toBe('interactions.state.failed');
    expect(state({ status: 'outstanding', date_expired: '2026-11-05T00:00:00Z' })).toBe(
      'interactions.state.expired'
    );
    expect(state({ status: 'in_progress' })).toBe('interactions.state.outstanding');
    expect(state({ status: 'cancelled' })).toBeUndefined();
    expect(run([contract({ status: 'deleted' }), contract({ type: 'loan' })])).toEqual([]);
  });
});
