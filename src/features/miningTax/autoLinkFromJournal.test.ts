import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { autoLinkRecordedPaymentsFromJournals } from './autoLinkFromJournal';

const CHAR = 1;
const LANDLORD = 9;

function entry(
  id: number,
  amount: number,
  date = '2026-11-09T09:46:00Z',
  to = LANDLORD
): WalletJournalEntry {
  return {
    id,
    amount,
    date,
    ref_type: 'player_donation',
    second_party_id: to,
  } as WalletJournalEntry;
}

/** A Settle-up payment the pilot recorded to the Landlord, before its transaction showed up. */
async function seedRecorded(refId: string, amount: number) {
  await db.payees.put({
    id: 'p1',
    characterId: CHAR,
    name: 'Landlord',
    defaultTaxPct: 10,
    entityId: LANDLORD,
    entityKind: 'character',
    updatedAt: 0,
  });
  await db.miningTaxPaymentLinks.put({
    id: `recorded:${refId}`,
    characterId: CHAR,
    payeeId: 'p1',
    kind: 'recorded',
    refId,
    amount,
    paidOn: '2026-11-09',
    source: 'manual',
    updatedAt: 0,
  });
}

const keys = async () => (await db.miningTaxPaymentLinks.toArray()).map((l) => [l.id, l.source]);

beforeEach(async () => {
  await db.miningTaxPaymentLinks.clear();
  await db.miningTaxAssignments.clear();
  await db.payees.clear();
  await db.settings.clear();
});

describe('autoLinkRecordedPaymentsFromJournals', () => {
  it('replaces a recorded payment with the one journal entry of its amount, date and recipient', async () => {
    await seedRecorded('r1', 10_898_549);
    await autoLinkRecordedPaymentsFromJournals([
      { characterId: CHAR, entries: [entry(1, -5), entry(2, -10_898_549)] },
    ]);
    expect(await keys()).toEqual([['journal:2', 'auto']]);
  });

  it('never links when two entries could be the payment', async () => {
    await seedRecorded('r1', 100);
    await autoLinkRecordedPaymentsFromJournals([
      { characterId: CHAR, entries: [entry(1, -100), entry(2, -100)] },
    ]);
    expect(await keys()).toEqual([['recorded:r1', 'manual']]);
  });

  it('never links an entry to someone else', async () => {
    await seedRecorded('r1', 100);
    await autoLinkRecordedPaymentsFromJournals([
      { characterId: CHAR, entries: [entry(1, -100, undefined, 77)] },
    ]);
    expect(await keys()).toEqual([['recorded:r1', 'manual']]);
  });

  it('does nothing without recorded payments', async () => {
    await expect(
      autoLinkRecordedPaymentsFromJournals([{ characterId: CHAR, entries: [entry(1, -100)] }])
    ).resolves.toBeUndefined();
    expect(await keys()).toEqual([]);
  });

  it('links once when run twice at the same time', async () => {
    await seedRecorded('r1', 100);
    const journals = [{ characterId: CHAR, entries: [entry(1, -100)] }];
    await Promise.all([
      autoLinkRecordedPaymentsFromJournals(journals),
      autoLinkRecordedPaymentsFromJournals(journals),
    ]);
    expect(await keys()).toEqual([['journal:1', 'auto']]);
  });
});
