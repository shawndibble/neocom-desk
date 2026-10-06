import { describe, it, expect } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { contractReceiver } from './contractCounterparty';

function c(o: Partial<Contract> = {}): Contract {
  return {
    contract_id: 1,
    issuer_id: 10,
    issuer_corporation_id: 20,
    assignee_id: 0,
    acceptor_id: 0,
    type: 'item_exchange',
    status: 'outstanding',
    for_corporation: false,
    availability: 'public',
    date_issued: '2026-08-01T00:00:00Z',
    date_expired: '2026-08-10T00:00:00Z',
    ...o,
  };
}

describe('contractReceiver', () => {
  it('prefers the acceptor', () => {
    expect(contractReceiver(c({ acceptor_id: 5, assignee_id: 6 }), 10)).toEqual({
      id: 5,
      kind: 'character',
      role: 'acceptor',
    });
  });
  it('falls back to the assignee, kind by availability', () => {
    expect(contractReceiver(c({ assignee_id: 6, availability: 'personal' }), 10)).toEqual({
      id: 6,
      kind: 'character',
      role: 'assignee',
    });
    expect(contractReceiver(c({ assignee_id: 7, availability: 'corporation' }), 10)?.kind).toBe(
      'corporation'
    );
    expect(contractReceiver(c({ assignee_id: 8, availability: 'alliance' }), 10)?.kind).toBe(
      'alliance'
    );
  });
  it('keeps the corp kind when the assigned corp accepted', () => {
    expect(
      contractReceiver(c({ acceptor_id: 7, assignee_id: 7, availability: 'corporation' }), 10)
    ).toEqual({ id: 7, kind: 'corporation', role: 'acceptor' });
  });
  it('is null for public/unassigned', () => {
    expect(contractReceiver(c(), 10)).toBeNull();
  });
  it('is null when the receiver is the pilot', () => {
    expect(contractReceiver(c({ acceptor_id: 10 }), 10)).toBeNull();
    expect(contractReceiver(c({ assignee_id: 10, availability: 'personal' }), 10)).toBeNull();
  });
});
