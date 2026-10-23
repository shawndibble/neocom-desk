import { describe, expect, it } from 'vitest';
import type { HeldQuote } from './buyback';
import {
  MAX_LINKED_CONTRACTS,
  linkQuoteContracts,
  isSellersContractToBuyer,
  priceDiffers,
  quoteContractStatus,
  type BuybackContract,
} from './buybackContracts';

const DAY = 86_400_000;
const NOW = 10 * DAY;
const SELLER = 100;
const BUYER = 200;

const quote: HeldQuote = {
  lines: [
    { typeId: 1230, name: 'Veldspar', quantity: 1000, unitPrice: 10, total: 9000 },
    { typeId: 34, name: 'Tritanium', quantity: 500, unitPrice: 4, total: 1800 },
  ],
  total: 10800,
  quotedAt: 5 * DAY,
  expiresAt: 19 * DAY,
};

const contract = (over: Partial<BuybackContract> = {}): BuybackContract => ({
  contractId: 1,
  type: 'item_exchange',
  status: 'outstanding',
  issuerId: SELLER,
  assigneeId: BUYER,
  acceptorId: 0,
  dateIssued: 6 * DAY,
  dateExpired: 20 * DAY,
  price: 10800,
  items: [
    { typeId: 1230, quantity: 1000 },
    { typeId: 34, quantity: 500 },
  ],
  ...over,
});

describe('quoteContractStatus', () => {
  it('names the five states a buyer and seller see', () => {
    expect(quoteContractStatus('outstanding', 20 * DAY, NOW)).toBe('outstanding');
    expect(quoteContractStatus('in_progress', 20 * DAY, NOW)).toBe('inProgress');
    expect(quoteContractStatus('finished', 20 * DAY, NOW)).toBe('finished');
    expect(quoteContractStatus('finished_issuer', 20 * DAY, NOW)).toBe('finished');
    expect(quoteContractStatus('finished_contractor', 20 * DAY, NOW)).toBe('finished');
    expect(quoteContractStatus('rejected', 20 * DAY, NOW)).toBe('rejected');
  });
  it('reads an outstanding contract past its expiry as expired', () => {
    expect(quoteContractStatus('outstanding', NOW - 1, NOW)).toBe('expired');
  });
  it('is null for a contract that is gone: cancelled, deleted or failed', () => {
    for (const status of ['cancelled', 'deleted', 'failed']) {
      expect(quoteContractStatus(status, 20 * DAY, NOW)).toBeNull();
    }
  });
});

describe('priceDiffers', () => {
  it('compares the contract price with the quoted total', () => {
    expect(priceDiffers(10800, 10800)).toBe(false);
    expect(priceDiffers(10000, 10800)).toBe(true);
  });
});

describe('linkQuoteContracts', () => {
  it('links the seller’s item exchange to the buyer that carries exactly the quoted items', () => {
    expect(linkQuoteContracts(quote, SELLER, BUYER, [contract()], NOW)).toEqual([
      { contractId: 1, status: 'outstanding', priceDiffers: false },
    ]);
  });

  it('links a contract the buyer accepted (acceptor, not assignee)', () => {
    const accepted = contract({ assigneeId: 0, acceptorId: BUYER, status: 'finished' });
    expect(linkQuoteContracts(quote, SELLER, BUYER, [accepted], NOW)[0].status).toBe('finished');
  });

  it('still links a contract at another price, and marks it', () => {
    const [link] = linkQuoteContracts(quote, SELLER, BUYER, [contract({ price: 9000 })], NOW);
    expect(link.priceDiffers).toBe(true);
  });

  it('ignores contracts that are not this quote’s', () => {
    const others = [
      contract({ contractId: 2, type: 'courier' }),
      contract({ contractId: 3, issuerId: 999 }),
      contract({ contractId: 4, assigneeId: 777 }),
      contract({ contractId: 5, dateIssued: 4 * DAY }),
      contract({ contractId: 6, items: [{ typeId: 1230, quantity: 1000 }] }),
      contract({
        contractId: 7,
        items: [
          { typeId: 1230, quantity: 999 },
          { typeId: 34, quantity: 500 },
        ],
      }),
      contract({ contractId: 8, status: 'cancelled' }),
    ];
    expect(linkQuoteContracts(quote, SELLER, BUYER, others, NOW)).toEqual([]);
  });

  it('keeps a match a few minutes older than the quote: the two clocks differ', () => {
    const early = contract({ dateIssued: quote.quotedAt - 5 * 60_000 });
    expect(linkQuoteContracts(quote, SELLER, BUYER, [early], NOW)).toHaveLength(1);
  });

  it('adds up a type listed as two stacks', () => {
    const split = contract({
      items: [
        { typeId: 1230, quantity: 600 },
        { typeId: 1230, quantity: 400 },
        { typeId: 34, quantity: 500 },
      ],
    });
    expect(linkQuoteContracts(quote, SELLER, BUYER, [split], NOW)).toHaveLength(1);
  });

  it('lists the newest contract first and keeps a few', () => {
    const many = Array.from({ length: MAX_LINKED_CONTRACTS + 2 }, (_, i) =>
      contract({ contractId: 100 + i, dateIssued: 6 * DAY + i })
    );
    const links = linkQuoteContracts(quote, SELLER, BUYER, many, NOW);
    expect(links).toHaveLength(MAX_LINKED_CONTRACTS);
    expect(links[0].contractId).toBe(100 + MAX_LINKED_CONTRACTS + 1);
  });
});

describe('isSellersContractToBuyer', () => {
  const read = { type: 'item_exchange', issuer_id: SELLER, assignee_id: BUYER, acceptor_id: 0 };
  it('backs a link only when the buyer’s copy is the seller’s item exchange to the buyer', () => {
    expect(isSellersContractToBuyer(read, SELLER, BUYER)).toBe(true);
    expect(
      isSellersContractToBuyer({ ...read, assignee_id: 0, acceptor_id: BUYER }, SELLER, BUYER)
    ).toBe(true);
  });
  it('refuses a contract of someone else’s, to someone else, or of another kind', () => {
    expect(isSellersContractToBuyer({ ...read, issuer_id: 999 }, SELLER, BUYER)).toBe(false);
    expect(isSellersContractToBuyer({ ...read, assignee_id: 7 }, SELLER, BUYER)).toBe(false);
    expect(isSellersContractToBuyer({ ...read, type: 'courier' }, SELLER, BUYER)).toBe(false);
    expect(isSellersContractToBuyer(read, null, BUYER)).toBe(false);
  });
});
