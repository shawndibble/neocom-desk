import { describe, expect, it } from 'vitest';
import type { MiningTaxAssignmentRecord, PayeeRecord } from '@/db';
import type { PayeeBalance } from './balances';
import type { GroupMember } from './groupRows';
import type { MoonMiningTaxRow } from './snapshot';
import { suggestLink, unlinkedPayments, withinLinkWindow, type MadePayment } from './paymentLinks';

const CHAR_A = 1;
const TYPE_A = 45490;
const LANDLORD_ID = 90_000_001;

function payee(overrides: Partial<PayeeRecord> = {}): PayeeRecord {
  return {
    id: 'payee-1',
    characterId: CHAR_A,
    name: 'Landlord Corp',
    defaultTaxPct: 10,
    updatedAt: 1,
    ...overrides,
  };
}

function assignment(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR_A,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'payee-1',
    oreLines: [{ typeId: TYPE_A, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

function member(a: MiningTaxAssignmentRecord): GroupMember {
  const row: MoonMiningTaxRow = {
    characterId: a.characterId,
    characterName: 'Pilot',
    entry: {
      characterId: a.characterId,
      date: a.date,
      solarSystemId: a.solarSystemId,
      oreLines: [],
    },
    assignments: [a],
    unassignedOreLines: [],
  };
  return { row, assignment: a };
}

function balance(p: PayeeRecord, assignments: MiningTaxAssignmentRecord[]): PayeeBalance {
  return {
    payee: p,
    owed: assignments.reduce((sum, a) => sum + a.taxOwed, 0),
    members: assignments.map(member),
  };
}

function payment(overrides: Partial<MadePayment> = {}): MadePayment {
  return {
    key: 'journal:11',
    kind: 'journal',
    refId: 11,
    characterId: CHAR_A,
    date: '2026-09-06T20:00:00Z',
    amount: 100,
    method: 'donation',
    counterpartyId: LANDLORD_ID,
    label: 'Player donation',
    ...overrides,
  };
}

describe('withinLinkWindow', () => {
  it('accepts an entry mined before the payment, inside the window', () => {
    expect(withinLinkWindow('2026-09-04', '2026-09-06T20:00:00Z')).toBe(true);
    expect(withinLinkWindow('2026-09-06', '2026-09-06T20:00:00Z')).toBe(true);
  });

  it('allows one day of grace for the EVE/UTC edge', () => {
    // Mined on the 7th (UTC) but paid late on the 6th local-side — an entry a
    // day "ahead" of its payment is still plausibly what it settled.
    expect(withinLinkWindow('2026-09-07', '2026-09-06T20:00:00Z')).toBe(true);
  });

  it('rejects an entry mined well after the payment — you pay after you mine', () => {
    expect(withinLinkWindow('2026-09-09', '2026-09-06T20:00:00Z')).toBe(false);
  });

  it('rejects an entry older than the window', () => {
    expect(withinLinkWindow('2026-08-01', '2026-09-06T20:00:00Z')).toBe(false);
  });
});

describe('unlinkedPayments', () => {
  it('drops a journal payment an Assignment already references', () => {
    const linked = assignment({
      status: 'paid',
      payment: {
        paymentId: 'p1',
        paidOn: '2026-09-06',
        method: 'donation',
        amount: 100,
        journalRefId: 11,
      },
    });

    const result = unlinkedPayments(
      [payment({ refId: 11 }), payment({ key: 'journal:12', refId: 12 })],
      [linked]
    );

    expect(result.map((p) => p.refId)).toEqual([12]);
  });

  it('drops a contract payment an Assignment already references, without confusing it for a journal id', () => {
    const linked = assignment({
      status: 'paid',
      payment: {
        paymentId: 'p1',
        paidOn: '2026-09-06',
        method: 'contract',
        amount: 100,
        contractId: 11,
      },
    });

    const journal = payment({ kind: 'journal', refId: 11, key: 'journal:11' });
    const contract = payment({ kind: 'contract', refId: 11, key: 'contract:11', amount: null });

    const result = unlinkedPayments([journal, contract], [linked]);

    // Same numeric id, different namespace — only the contract is linked.
    expect(result.map((p) => p.key)).toEqual(['journal:11']);
  });
});

describe('suggestLink', () => {
  it('pins the Payee by learned entityId and pre-ticks the whole in-window balance', () => {
    const p = payee({ entityId: LANDLORD_ID });
    const b = balance(p, [assignment({ id: 'a1' }), assignment({ id: 'a2', date: '2026-09-05' })]);

    const result = suggestLink(payment({ amount: 200 }), [b]);

    expect(result?.balance.payee.id).toBe('payee-1');
    expect(result?.members.map((m) => m.assignment.id)).toEqual(['a1', 'a2']);
    expect(result?.confidence).toBe('identity-and-amount');
  });

  it('bootstraps on a case-insensitive name match, but says so rather than claiming identity', () => {
    const b = balance(payee(), [assignment()]);

    const result = suggestLink(
      payment({ counterpartyId: undefined, counterpartyName: 'landlord corp' }),
      [b]
    );

    expect(result?.balance.payee.id).toBe('payee-1');
    // Not `identity-and-amount`: a Payee name is a free-text label that need
    // not equal any ESI name, so it must never be reported as knowing who was paid.
    expect(result?.confidence).toBe('name-and-amount');
  });

  it('offers a name match with no amount agreement — the round-number donation that bootstraps entityId', () => {
    const b = balance(payee(), [assignment({ taxOwed: 47_300_000 })]);

    const result = suggestLink(
      payment({ counterpartyId: undefined, counterpartyName: 'Landlord Corp', amount: 50_000_000 }),
      [b]
    );

    expect(result?.confidence).toBe('name');
  });

  it('prefers a learned entityId over a name match on a different Payee', () => {
    const learned = payee({ id: 'payee-1', name: 'Rentals Inc', entityId: LANDLORD_ID });
    const namesake = payee({ id: 'payee-2', name: 'Landlord Corp' });
    const b1 = balance(learned, [assignment({ id: 'a1', payeeId: 'payee-1', taxOwed: 100 })]);
    const b2 = balance(namesake, [assignment({ id: 'a2', payeeId: 'payee-2', taxOwed: 100 })]);

    const result = suggestLink(payment({ counterpartyName: 'Landlord Corp' }), [b2, b1]);

    expect(result?.balance.payee.id).toBe('payee-1');
    expect(result?.confidence).toBe('identity-and-amount');
  });

  it('picks the single Assignment whose tax matches when the whole balance does not', () => {
    const p = payee({ entityId: LANDLORD_ID });
    const b = balance(p, [
      assignment({ id: 'a1', taxOwed: 100 }),
      assignment({ id: 'a2', date: '2026-09-05', taxOwed: 250 }),
    ]);

    const result = suggestLink(payment({ amount: 250 }), [b]);

    expect(result?.members.map((m) => m.assignment.id)).toEqual(['a2']);
    expect(result?.confidence).toBe('identity-and-amount');
  });

  it('matches on amount alone when nothing identifies the recipient', () => {
    const b = balance(payee(), [assignment({ taxOwed: 100 })]);

    const result = suggestLink(payment({ counterpartyId: 999, amount: 100 }), [b]);

    expect(result?.confidence).toBe('amount');
  });

  it('offers an identified Payee even when no amount agrees — payment in kind has no ISK figure', () => {
    const p = payee({ entityId: LANDLORD_ID });
    const b = balance(p, [assignment({ taxOwed: 100 })]);

    const result = suggestLink(
      payment({ kind: 'contract', key: 'contract:5', refId: 5, amount: null }),
      [b]
    );

    expect(result?.confidence).toBe('identity');
    expect(result?.members).toHaveLength(1);
  });

  it('offers nothing when neither identity nor amount agrees — the no-nag rule', () => {
    const b = balance(payee(), [assignment({ taxOwed: 100 })]);

    expect(suggestLink(payment({ counterpartyId: 999, amount: 987_654 }), [b])).toBeNull();
  });

  it('ignores Assignments outside the date window even for an identified Payee', () => {
    const p = payee({ entityId: LANDLORD_ID });
    const b = balance(p, [assignment({ date: '2026-06-01' })]);

    expect(suggestLink(payment({ amount: null, kind: 'contract' }), [b])).toBeNull();
  });

  it('prefers the identified Payee over a different one whose amount happens to match', () => {
    const identified = payee({ id: 'payee-1', name: 'Landlord', entityId: LANDLORD_ID });
    const coincidence = payee({ id: 'payee-2', name: 'Someone Else' });
    const b1 = balance(identified, [assignment({ id: 'a1', payeeId: 'payee-1', taxOwed: 999 })]);
    const b2 = balance(coincidence, [assignment({ id: 'a2', payeeId: 'payee-2', taxOwed: 100 })]);

    const result = suggestLink(payment({ amount: 100 }), [b2, b1]);

    expect(result?.balance.payee.id).toBe('payee-1');
    expect(result?.confidence).toBe('identity');
  });

  it('skips a settled Payee — there is nothing for a payment to have covered', () => {
    const p = payee({ entityId: LANDLORD_ID });
    const b = balance(p, [assignment({ status: 'paid', taxOwed: 0 })]);
    b.members = [];
    b.owed = 0;

    expect(suggestLink(payment(), [b])).toBeNull();
  });
});
