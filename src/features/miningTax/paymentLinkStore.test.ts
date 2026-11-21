import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import type { PayeePaymentLink } from '@/engine/miningTax/payeeAccount';
import { readTombstones, tombstoneKey } from '@/sync/localBookkeeping';
import { MINING_TAX_PAYMENT_LINKS } from '@/sync/syncedCollections';
import { PAYEE_CHECKPOINTS_KEY, readStoredCheckpoints } from '@/db/payeeCheckpoints';
import { pullCursorKey } from '@/sync/localBookkeeping';
import {
  linksReady,
  loadBilledElsewhere,
  loadPaymentLinks,
  readLegacyPaidMarks,
  removePaymentLinks,
  saveBilledElsewhere,
  savePayeeCheckpoints,
  savePaymentLink,
} from './paymentLinkStore';
import { readPayeeHistoryGen } from '@/db/payeeCheckpoints';

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

  it('reads a paid mark into a link once, and never writes the mark', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    const before = await db.miningTaxAssignments.get('a');
    await readLegacyPaidMarks();
    await readLegacyPaidMarks();
    expect(await loadPaymentLinks()).toMatchObject([
      { id: 'legacy:pay1', payeeId: 'p1', characterId: 7, amount: 250_000 },
    ]);
    expect(await db.miningTaxAssignments.get('a')).toEqual(before);
  });

  it('a journal an older client attaches later adds nothing', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    await readLegacyPaidMarks();
    const m = marked('a');
    await db.miningTaxAssignments.put({
      ...m,
      payment: { ...m.payment!, journalLinks: [{ refId: 41, source: 'auto' }] },
    });
    await readLegacyPaidMarks();
    expect(await ids()).toEqual(['legacy:pay1']);
  });

  it('a second installment on the same payment adds nothing; a new payment is its own link', async () => {
    const m = marked('a');
    await db.miningTaxAssignments.put({
      ...m,
      payment: { ...m.payment!, journalLinks: [{ refId: 41, source: 'manual' }] },
    });
    await readLegacyPaidMarks();
    await db.miningTaxAssignments.put({
      ...m,
      payment: {
        ...m.payment!,
        journalLinks: [
          { refId: 41, source: 'manual' },
          { refId: 42, source: 'manual' },
        ],
      },
    });
    await db.miningTaxAssignments.put(
      marked('b', {
        payment: { paymentId: 'pay2', paidOn: '2026-10-09', method: 'other', amount: 9 },
      })
    );
    await readLegacyPaidMarks();
    expect(await ids()).toEqual(['legacy:pay1', 'legacy:pay2']);
    expect((await db.miningTaxPaymentLinks.get('legacy:pay1'))?.amount).toBe(250_000);
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

  it('an unlinked legacy link stays, paying nothing, and is never brought back; the mark stays', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    await readLegacyPaidMarks();
    await removePaymentLinks(['legacy:pay1']);
    await readLegacyPaidMarks();
    expect(await loadPaymentLinks()).toMatchObject([{ id: 'legacy:pay1', unlinked: true }]);
    expect((await db.miningTaxAssignments.get('a'))?.status).toBe('paid');
  });

  it('an unmark and re-record on an older client: the new payment is its own link, the old one stays', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    await readLegacyPaidMarks();
    // The older client unmarks and records again: a new payment id.
    await db.miningTaxAssignments.put(
      marked('a', {
        payment: { paymentId: 'pay3', paidOn: '2026-10-06', method: 'other', amount: 250_000 },
      })
    );
    await readLegacyPaidMarks();
    // Absence is never read as a withdrawal (it is also "not synced yet"): the pilot unlinks the old one.
    expect(await ids()).toEqual(['legacy:pay1', 'legacy:pay3']);
  });

  it('skips a link this device tombstoned whose deletion is not pushed yet (M4)', async () => {
    await db.miningTaxAssignments.put(marked('a'));
    // Another device unlinked it mid-sync; here only the tombstone has landed so far.
    await db.settings.put({
      key: tombstoneKey(MINING_TAX_PAYMENT_LINKS, 7),
      value: [{ id: 'legacy:pay1', deletedAt: 5 }],
    });
    await readLegacyPaidMarks();
    expect(await ids()).toEqual([]);
  });
});

describe('checkpoints on the device', () => {
  const cp = (through: string) => ({
    checkpoint: {
      minerId: 'p1',
      through,
      balance: 0,
      credit: 0,
      paidThrough: through,
      owed: [],
      at: 'x',
    } as never,
  });

  it('a link dated on or before a checkpoint drops it', async () => {
    await db.settings.put({ key: PAYEE_CHECKPOINTS_KEY, value: { p1: cp('2026-09-30') } });
    await savePaymentLink(link({ paidOn: '2026-09-12' }), 7);
    expect(await readStoredCheckpoints()).toEqual({});
  });

  it('stores a checkpoint only while nothing was written since its inputs were read', async () => {
    const gen = await readPayeeHistoryGen();
    await savePaymentLink(link({ paidOn: '2026-10-12' }), 7);
    await savePayeeCheckpoints(new Map([['p1', cp('2026-09-30')]]), gen);
    expect(await readStoredCheckpoints()).toEqual({});
    await savePayeeCheckpoints(new Map([['p1', cp('2026-09-30')]]), await readPayeeHistoryGen());
    expect(Object.keys(await readStoredCheckpoints())).toEqual(['p1']);
  });

  it('a changed book share drops the checkpoints from its Assignment’s day', async () => {
    await db.settings.put({ key: PAYEE_CHECKPOINTS_KEY, value: { p1: cp('2026-09-30') } });
    expect(await saveBilledElsewhere(new Map([['a1', 0.5]]), () => '2026-10-05')).toBe(true);
    expect(Object.keys(await readStoredCheckpoints())).toEqual(['p1']);
    expect(await saveBilledElsewhere(new Map([['a1', 0.5]]), () => '2026-10-05')).toBe(false);
    expect(await saveBilledElsewhere(new Map([['a1', 1]]), () => '2026-09-05')).toBe(true);
    expect(await readStoredCheckpoints()).toEqual({});
    expect(await loadBilledElsewhere()).toEqual(new Map([['a1', 1]]));
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
