import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import type { CachedResult } from '@/esi/cache';
import type { WalletJournalEntry, WalletTransaction } from '@/esi/endpoints';
import {
  archiveJournal,
  archiveTransactions,
  clearWalletArchive,
  journalWithArchive,
  loadWalletArchiveInfo,
  transactionsWithArchive,
} from './walletArchive';

const CHAR = 7;
const DAY = 86_400_000;
const NOW = Date.now();

const iso = (ms: number) => `${new Date(ms).toISOString().slice(0, 19)}Z`;
const entry = (id: number, ageDays: number): WalletJournalEntry => ({
  id,
  date: iso(NOW - ageDays * DAY),
  ref_type: 'bounty_prizes',
  description: `e${id}`,
});
const txn = (id: number, ageDays: number): WalletTransaction => ({
  transaction_id: id,
  date: iso(NOW - ageDays * DAY),
  location_id: 1,
  type_id: 34,
  unit_price: 1,
  quantity: 1,
  client_id: 2,
  is_buy: true,
  journal_ref_id: id,
  is_personal: true,
});
function live<T>(data: T[], over: Partial<CachedResult<T[]>> = {}): CachedResult<T[]> {
  return { data, fetchedAt: new Date(NOW), fromCache: false, truncated: false, ...over };
}

beforeEach(async () => {
  await db.walletJournalArchive.clear();
  await db.walletTransactionArchive.clear();
  await db.walletArchiveCoverage.clear();
});

describe('archiveJournal', () => {
  it('stores each entry id once across overlapping fetches', async () => {
    await archiveJournal(CHAR, live([entry(1, 5), entry(2, 4)]));
    await archiveJournal(CHAR, live([entry(2, 4), entry(3, 1)]));
    expect(await db.walletJournalArchive.where('characterId').equals(CHAR).count()).toBe(3);
  });

  it('still shows an entry ESI no longer returns, with live rows winning', async () => {
    await archiveJournal(CHAR, live([entry(1, 40), entry(2, 5)]));
    const merged = await journalWithArchive(CHAR, live([{ ...entry(2, 5), description: 'new' }]));
    expect(merged?.data.map((e) => [e.id, e.description])).toEqual([
      [2, 'new'],
      [1, 'e1'],
    ]);
  });

  it('builds a saved-copy result from the archive when nothing live came back', async () => {
    expect(await journalWithArchive(CHAR, null)).toBeNull();
    await archiveJournal(CHAR, live([entry(1, 40)]));
    const result = await journalWithArchive(CHAR, null);
    expect(result?.data).toHaveLength(1);
    expect(result?.fromCache).toBe(true);
  });

  it('prunes entries older than 365 days', async () => {
    await archiveJournal(CHAR, live([entry(1, 400), entry(2, 364), entry(3, 1)]));
    const ids = (await db.walletJournalArchive.toArray()).map((r) => r.id).sort();
    expect(ids).toEqual([2, 3]);
  });

  it('keeps Characters apart', async () => {
    await archiveJournal(CHAR, live([entry(1, 1)]));
    await archiveJournal(8, live([entry(1, 1)]));
    expect(await db.walletJournalArchive.count()).toBe(2);
  });

  it('does not cap by count', async () => {
    const rows = Array.from({ length: 6000 }, (_, i) => entry(i + 1, 2));
    await archiveJournal(CHAR, live(rows));
    expect(await db.walletJournalArchive.where('characterId').equals(CHAR).count()).toBe(6000);
  });
});

describe('coverage', () => {
  it('a complete fetch covers ESI window; the range appears only once reached', async () => {
    await archiveJournal(CHAR, live([entry(1, 3)]));
    const info = await loadWalletArchiveInfo(CHAR, NOW);
    expect(info.since).toBe(NOW - 30 * DAY);
    expect(info.ranges).toEqual([]);
    expect(info.gaps).toEqual([]);
  });

  it('a truncated fetch stores rows but marks no window covered', async () => {
    await archiveJournal(CHAR, live([entry(1, 3)], { truncated: true }));
    expect(await db.walletJournalArchive.count()).toBe(1);
    expect((await loadWalletArchiveInfo(CHAR, NOW)).since).toBeNull();
  });

  it('a saved copy marks nothing covered', async () => {
    await archiveJournal(CHAR, live([entry(1, 3)], { fromCache: true }));
    expect((await loadWalletArchiveInfo(CHAR, NOW)).since).toBeNull();
  });

  it('shows a gap when the app was closed past ESI window, and offers 90 days once reached', async () => {
    await db.walletArchiveCoverage.put({
      characterId: CHAR,
      kind: 'journal',
      windows: [[NOW - 120 * DAY, NOW - 90 * DAY]],
    });
    await archiveJournal(CHAR, live([entry(1, 3)]));
    const info = await loadWalletArchiveInfo(CHAR, NOW);
    expect(info.gaps).toEqual([[NOW - 90 * DAY, NOW - 30 * DAY]]);
    expect(info.ranges).toEqual([90]);
  });
});

describe('transactions', () => {
  it('archives by transaction id, prunes and unions like the journal', async () => {
    await archiveTransactions(CHAR, live([txn(1, 40), txn(2, 400), txn(3, 2)]));
    await archiveTransactions(CHAR, live([txn(3, 2)]));
    expect(
      (await db.walletTransactionArchive.toArray()).map((r) => r.transaction_id).sort()
    ).toEqual([1, 3]);
    const merged = await transactionsWithArchive(CHAR, live([txn(3, 2)]));
    expect(merged?.data.map((t) => t.transaction_id).sort()).toEqual([1, 3]);
  });

  it('a capped cursor walk covers only back to its oldest row', async () => {
    await archiveTransactions(CHAR, live([txn(1, 3)], { truncated: true }));
    const row = await db.walletArchiveCoverage.get([CHAR, 'transactions']);
    expect(row?.windows).toHaveLength(1);
    expect(NOW - row!.windows[0][0]).toBeGreaterThan(2.9 * DAY);
    expect(NOW - row!.windows[0][0]).toBeLessThan(3.1 * DAY);
  });
});

describe('clearWalletArchive', () => {
  it('removes only that Character’s rows and coverage', async () => {
    await archiveJournal(CHAR, live([entry(1, 1)]));
    await archiveTransactions(CHAR, live([txn(1, 1)]));
    await archiveJournal(8, live([entry(1, 1)]));
    await clearWalletArchive(CHAR);
    expect(await db.walletJournalArchive.where('characterId').equals(CHAR).count()).toBe(0);
    expect(await db.walletTransactionArchive.where('characterId').equals(CHAR).count()).toBe(0);
    expect(await db.walletArchiveCoverage.where('characterId').equals(CHAR).count()).toBe(0);
    expect(await db.walletJournalArchive.where('characterId').equals(8).count()).toBe(1);
  });
});
