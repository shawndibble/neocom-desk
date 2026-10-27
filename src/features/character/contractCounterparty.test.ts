import { describe, it, expect } from 'vitest';
import type { Contract } from '@/esi/endpoints';
import { contractIssuer, contractReceiver } from './contractCounterparty';

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

describe('contractReceiver with resolved categories', () => {
  it('links a corp that took a public contract as a corporation', () => {
    const cats = new Map([[5, 'corporation' as const]]);
    expect(contractReceiver(c({ acceptor_id: 5 }), 10, cats)?.kind).toBe('corporation');
  });
  it('uses the category for an offered assignee too', () => {
    const cats = new Map([[6, 'alliance' as const]]);
    expect(contractReceiver(c({ assignee_id: 6, availability: 'personal' }), 10, cats)?.kind).toBe(
      'alliance'
    );
  });
  it('falls back when the category is unknown or not an owner kind', () => {
    const cats = new Map([[5, 'station' as const]]);
    expect(contractReceiver(c({ acceptor_id: 5 }), 10, cats)?.kind).toBe('character');
    expect(contractReceiver(c({ acceptor_id: 5 }), 10, new Map())?.kind).toBe('character');
  });
});

describe('contractIssuer', () => {
  it('is the pilot for a personal contract', () => {
    expect(contractIssuer(c())).toEqual({ id: 10, kind: 'character' });
  });
  it('is the corp when issued on its behalf', () => {
    expect(contractIssuer(c({ for_corporation: true }))).toEqual({ id: 20, kind: 'corporation' });
  });
});
