import { describe, expect, it } from 'vitest';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { statedDonationsOf } from './corpBookView';
import { corpPayeeId } from './corpRows';

const link = (over: Partial<PayeePaymentLink> = {}): PayeePaymentLink => ({
  payeeId: corpPayeeId(5),
  kind: 'recorded',
  refId: 'r1',
  amount: 1_000_000,
  paidOn: '2026-11-20',
  source: 'manual',
  characterId: 7,
  ...over,
});

describe('statedDonationsOf', () => {
  it("reads a payment recorded to the book's Payee as a donation sent that day", () => {
    expect(statedDonationsOf([link()], 5)).toEqual([
      {
        characterId: 7,
        counterpartyId: 5,
        amount: 1_000_000,
        date: '2026-11-20T23:59:59.000Z',
        method: 'donation',
        stated: true,
      },
    ]);
  });

  it("ignores another corporation's, a wallet link, and one with no paying Character", () => {
    expect(
      statedDonationsOf(
        [
          link({ payeeId: corpPayeeId(6) }),
          link({ kind: 'journal', refId: 9 }),
          link({ characterId: undefined }),
        ],
        5
      )
    ).toEqual([]);
  });
});
