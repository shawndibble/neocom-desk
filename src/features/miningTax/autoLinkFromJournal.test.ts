import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { WalletJournalEntry } from '@/esi/endpoints';
import { autoLinkRecordedPaymentsFromJournals } from './autoLinkFromJournal';

const CHAR = 1;

function entry(id: number, amount: number, date = '2026-11-09T09:46:00Z'): WalletJournalEntry {
  return {
    id,
    amount,
    date,
    ref_type: 'player_donation',
    second_party_id: 9,
  } as WalletJournalEntry;
}

async function seedRecorded(paymentId: string, amount: number) {
  await db.miningTaxAssignments.put({
    id: `a-${paymentId}`,
    characterId: CHAR,
    status: 'paid',
    payment: { paymentId, paidOn: '2026-11-09', method: 'donation', amount },
  } as never);
}

const linksOf = async (id: string) => (await db.miningTaxAssignments.get(id))?.payment;

beforeEach(async () => {
  await db.miningTaxAssignments.clear();
});

describe('autoLinkRecordedPaymentsFromJournals', () => {
  it('links a recorded payment to the one journal entry matching its amount and date', async () => {
    await seedRecorded('p1', 10_898_549);
    await autoLinkRecordedPaymentsFromJournals([
      { characterId: CHAR, entries: [entry(1, -5), entry(2, -10_898_549)] },
    ]);
    expect((await linksOf('a-p1'))?.journalLinks).toEqual([{ refId: 2, source: 'auto' }]);
  });

  it('never links when two entries could be the payment', async () => {
    await seedRecorded('p1', 100);
    await autoLinkRecordedPaymentsFromJournals([
      { characterId: CHAR, entries: [entry(1, -100), entry(2, -100)] },
    ]);
    expect((await linksOf('a-p1'))?.journalLinks).toBeUndefined();
  });

  it('does nothing without recorded unlinked payments', async () => {
    await expect(
      autoLinkRecordedPaymentsFromJournals([{ characterId: CHAR, entries: [entry(1, -100)] }])
    ).resolves.toBeUndefined();
  });
});
