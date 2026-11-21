import { beforeEach, describe, expect, it } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import {
  loadPaymentLinks,
  readLegacyPaidMarks,
  removePaymentLinks,
  savePaymentLink,
} from './paymentLinkStore';

const link = (over: Partial<PayeePaymentLink> = {}): PayeePaymentLink => ({
  payeeId: 'p1',
  kind: 'journal',
  refId: 41,
  amount: 250_000,
  paidOn: '2026-10-05',
  source: 'manual',
  ...over,
});

const marked = (
  id: string,
  over: Partial<MiningTaxAssignmentRecord> = {}
): MiningTaxAssignmentRecord => ({
  id,
  characterId: 7,
  date: '2026-10-01',
  solarSystemId: 30000142,
  payeeId: 'p1',
  oreLines: [],
  taxPct: 10,
  estimatedValue: 1_000_000,
  taxOwed: 100_000,
  status: 'paid',
  paidAt: 1,
  payment: { paymentId: 'pay1', paidOn: '2026-10-05', method: 'other', amount: 250_000 },
  updatedAt: 0,
  ...over,
});

beforeEach(async () => {
  await db.miningTaxPaymentLinks.clear();
  await db.miningTaxAssignments.clear();
  await db.settings.clear();
});

describe('payment links', () => {
  it('links a payment to one Payee only: linking it again moves it', async () => {
    await savePaymentLink(link(), 7);
    await savePaymentLink(link({ payeeId: 'p2' }), 8);
    const stored = await loadPaymentLinks();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ id: 'journal:41', payeeId: 'p2', characterId: 8 });
    // The copy under the first Character is tombstoned, so the move syncs.
    expect(
      (await readTombstones(tombstoneKey(MINING_TAX_PAYMENT_LINKS, 7))).map((t) => t.id)
    ).toEqual(['journal:41']);
  });

  it('replaces a recorded payment with the transaction that turned up', async () => {
    await savePaymentLink(link({ kind: 'recorded', refId: 'r1' }), 7);
    await savePaymentLink(link({ source: 'auto' }), 7, 'recorded:r1');
    expect((await loadPaymentLinks()).map((l) => l.id)).toEqual(['journal:41']);
  });
});

describe('readLegacyPaidMarks', () => {
  it('reads a paid mark into a link once, and leaves the mark as it was', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    await readLegacyPaidMarks();
    await readLegacyPaidMarks();
    expect(await loadPaymentLinks()).toMatchObject([
      { id: 'recorded:pay1', payeeId: 'p1', characterId: 7, amount: 250_000 },
    ]);
    expect((await db.miningTaxAssignments.get('a'))?.status).toBe('paid');
  });

  it('never brings back a link the pilot unlinked: its marks go with it', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    await readLegacyPaidMarks();
    await removePaymentLinks(['recorded:pay1']);
    await readLegacyPaidMarks();
    expect(await loadPaymentLinks()).toEqual([]);
    const a = await db.miningTaxAssignments.get('a');
    expect(a?.status).toBe('outstanding');
    expect(a?.payment).toBeUndefined();
  });

  it('never brings back a recorded payment its transaction replaced', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    await readLegacyPaidMarks();
    await savePaymentLink(link({ source: 'auto' }), 7, 'recorded:pay1');
    await readLegacyPaidMarks();
    expect((await loadPaymentLinks()).map((l) => l.id)).toEqual(['journal:41']);
  });
});
