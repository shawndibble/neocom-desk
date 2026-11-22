import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeRunningAccount';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import { pullCursorKey } from '@/sync/localBookkeeping';
import {
  linksReady,
  loadBilledElsewhere,
  loadBookOwned,
  loadLinkedDays,
  loadPayeeRunningAccounts,
  loadPaymentLinks,
  readLegacyPaidMarks,
  removePaymentLinks,
  saveBilledElsewhere,
  saveBookOwned,
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

  it('unlinking an ordinary link deletes and tombstones it, so the payment is offered again', async () => {
    await savePaymentLink(link(), 7);
    await removePaymentLinks(['journal:41']);
    expect(await loadPaymentLinks()).toEqual([]);
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
  const ids = async () => (await loadPaymentLinks()).map((l) => l.id).sort();

  it('reads each payment the marks name into one link, once per device, and clears the marks', async () => {
    await db.miningTaxAssignments.bulkPut([
      marked('a'),
      marked('b'),
      marked('c', {
        payment: { paymentId: 'pay2', paidOn: '2026-10-09', method: 'other', amount: 9 },
      }),
    ]);
    await readLegacyPaidMarks();
    expect(await ids()).toEqual(['legacy:pay1', 'legacy:pay2']);
    expect((await db.miningTaxPaymentLinks.get('legacy:pay1'))?.amount).toBe(250_000);
    const a = await db.miningTaxAssignments.get('a');
    expect(a?.status).toBe('outstanding');
    expect(a).not.toHaveProperty('payment');
    // Once per device: a mark that turns up later is not read.
    await db.miningTaxAssignments.put(
      marked('d', {
        payment: { paymentId: 'pay3', paidOn: '2026-10-10', method: 'other', amount: 1 },
      })
    );
    await readLegacyPaidMarks();
    expect(await ids()).toEqual(['legacy:pay1', 'legacy:pay2']);
  });

  it('two devices read the same mark into the same link', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    // Another device read it first; the link arrived by sync.
    await db.miningTaxPaymentLinks.put({
      ...link({ kind: 'legacy', refId: 'pay1', amount: 250_000 }),
      id: 'legacy:pay1',
      characterId: 7,
      updatedAt: 1,
    });
    await readLegacyPaidMarks();
    expect(await ids()).toEqual(['legacy:pay1']);
    expect((await db.miningTaxPaymentLinks.get('legacy:pay1'))?.updatedAt).toBe(1);
  });
});

describe('a book share', () => {
  it('is stored only when it changed', async () => {
    expect(await saveBilledElsewhere(new Map([['a1', 0.5]]))).toBe(true);
    expect(await saveBilledElsewhere(new Map([['a1', 0.5]]))).toBe(false);
    expect(await saveBilledElsewhere(new Map([['a1', 1]]))).toBe(true);
    expect(await loadBilledElsewhere()).toEqual(new Map([['a1', 1]]));
  });
});

describe('the Payees a book owns', () => {
  it('is stored only when it changed, as the device last saw the books', async () => {
    expect(await saveBookOwned(new Set(['p1']))).toBe(true);
    expect(await saveBookOwned(new Set(['p1']))).toBe(false);
    expect(await saveBookOwned(new Set())).toBe(true);
    expect(await loadBookOwned()).toEqual(new Set());
  });

  it('is read by every accounts build: the stored Payee has no account that counts, only history', async () => {
    await db.payees.put({
      id: 'p1',
      characterId: 7,
      name: 'Bureau',
      defaultTaxPct: 10,
      updatedAt: 1,
    });
    await db.miningTaxAssignments.put(
      marked('a', { status: 'outstanding', paidAt: undefined, payment: undefined })
    );
    await savePaymentLink(link({ amount: 100_000 }), 7);
    expect((await loadPayeeRunningAccounts()).of('p1')).toBeDefined();
    expect([...(await loadLinkedDays()).keys()]).toEqual(['journal:41']);

    await saveBookOwned(new Set(['p1']));
    const accounts = await loadPayeeRunningAccounts();
    expect(accounts.isBookOwned('p1')).toBe(true);
    expect(accounts.of('p1')).toBeUndefined();
    // Its old day still reads paid (a paid day is never unpaid), but pays nothing personal.
    expect(accounts.isPaid({ payeeId: 'p1', status: 'outstanding', date: '2026-10-01' })).toBe(
      true
    );
    expect((await loadLinkedDays()).size).toBe(0);
  });
});

describe('linksReady', () => {
  it('is ready when this device does not sync (tests never do)', async () => {
    expect(await linksReady([1, 2])).toBe(true);
  });

  it('waits for a completed links pull per Character when it syncs', async () => {
    vi.resetModules();
    vi.doMock('@/app/syncStatus', () => ({ isSyncConfigured: () => true }));
    const store = await import('./paymentLinkStore');
    await db.settings.put({
      key: pullCursorKey(1, 'miningTaxPaymentLinks'),
      value: { high: 0, fullAt: 0 },
    });
    expect(await store.linksReady([1, 2])).toBe(false);
    await db.settings.put({
      key: pullCursorKey(2, 'miningTaxPaymentLinks'),
      value: { high: 0, fullAt: 0 },
    });
    expect(await store.linksReady([1, 2])).toBe(true);
    vi.doUnmock('@/app/syncStatus');
  });
});
