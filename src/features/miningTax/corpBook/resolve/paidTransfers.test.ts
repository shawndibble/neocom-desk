import { describe, expect, it } from 'vitest';
import type { MadePayment } from '../../paymentLinks';
import { claimablePayments, recipientOf, transferChoices } from './paidTransfers';

const pay = (over: Partial<MadePayment>): MadePayment => ({
  key: `journal:${over.refId ?? 1}`,
  kind: 'journal',
  refId: 1,
  characterId: 7,
  date: '2026-11-03T10:00:00Z',
  amount: 5_000_000,
  method: 'donation',
  label: 'Donation',
  ...over,
});

describe('paid-to-a-person picker', () => {
  it('labels who received each payment: the book corporation, a person, another corporation', () => {
    const cats = new Map([
      [90, 'character' as const],
      [500, 'corporation' as const],
    ]);
    const out = transferChoices(
      [
        pay({ refId: 1, counterpartyId: 1000, date: '2026-11-04T00:00:00Z' }),
        pay({
          refId: 2,
          counterpartyId: 90,
          counterpartyName: 'Marta Vell',
          date: '2026-11-03T00:00:00Z',
        }),
        pay({ refId: 3, counterpartyId: 500, date: '2026-11-02T00:00:00Z' }),
      ],
      { bookCorporationId: 1000, since: '2026-11-01', categories: cats }
    );
    expect(
      out.map((c) => [c.transfer.journalRef, c.transfer.recipient, c.transfer.recipientId])
    ).toEqual([
      [1, 'corporation', undefined],
      [2, 'character', 90],
      [3, 'otherCorporation', 500],
    ]);
    expect(out[1].recipientName).toBe('Marta Vell');
  });

  it('lists only journal payments of ISK from the billed period on, newest first', () => {
    const out = transferChoices(
      [
        pay({ refId: 1, date: '2026-10-20T00:00:00Z' }),
        pay({ refId: 2, kind: 'contract', amount: null }),
        pay({ refId: 3, date: '2026-11-05T00:00:00Z' }),
        pay({ refId: 4, date: '2026-11-02T00:00:00Z' }),
      ],
      { bookCorporationId: 1000, since: '2026-11-01', categories: new Map() }
    );
    expect(out.map((c) => c.transfer.journalRef)).toEqual([3, 4]);
  });

  it('treats a recipient it cannot place as a person', () => {
    expect(recipientOf(77, 1000, undefined)).toBe('character');
    expect(recipientOf(undefined, 1000, undefined)).toBe('character');
  });

  it('never offers a payment a link holds, nor a donation the book already holds (audit bug 9)', () => {
    const out = claimablePayments(
      [
        pay({ refId: 1, counterpartyId: 1000, date: '2026-11-04T10:00:00Z' }),
        pay({ refId: 2, counterpartyId: 1000, date: '2026-11-05T10:00:00Z' }),
        pay({ refId: 3, counterpartyId: 90 }),
        pay({ refId: 4, counterpartyId: 91 }),
      ],
      {
        bookCorporationId: 1000,
        linked: new Set(['journal:3']),
        // The corp's journal entry for donation 1, a minute later: the book holds it.
        held: [{ characterId: 7, amount: 5_000_000, at: '2026-11-04T10:01:00Z' }],
      }
    );
    expect(out.map((p) => p.refId)).toEqual([2, 4]);
  });

  it('two equal donations: the book holding one still offers the other', () => {
    const out = claimablePayments(
      [
        pay({ refId: 1, counterpartyId: 1000, date: '2026-11-04T10:00:00Z' }),
        pay({ refId: 2, counterpartyId: 1000, date: '2026-11-04T10:02:00Z' }),
      ],
      {
        bookCorporationId: 1000,
        linked: new Set(),
        held: [{ characterId: 7, amount: 5_000_000, at: '2026-11-04T10:00:30Z' }],
      }
    );
    expect(out.map((p) => p.refId)).toEqual([2]);
  });
});
