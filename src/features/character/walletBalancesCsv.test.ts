import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { CharacterWalletBalance } from './wallet';
import { walletBalancesCsvColumns } from './walletBalancesCsv';

const t = (k: string) => k;

function entry(overrides: Partial<CharacterWalletBalance> = {}): CharacterWalletBalance {
  return {
    characterId: 1,
    characterName: 'Ava Tortuga',
    balanceResult: {
      data: 1_234_567.89,
      fetchedAt: new Date(),
      fromCache: false,
      truncated: false,
    },
    needsReauth: false,
    ...overrides,
  };
}

describe('walletBalancesCsvColumns', () => {
  it('uses the table headers: character, then ISK', () => {
    expect(walletBalancesCsvColumns(t).map((c) => c.header)).toEqual([
      'wallet.balanceCharacterColumn',
      'wallet.isk',
    ]);
  });

  it('writes the balance as a raw number next to the quoted name', () => {
    const csv = toCsv([entry()], walletBalancesCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe('"Ava Tortuga",1234567.89');
  });

  it('leaves the balance blank when it needs re-auth or never loaded, never 0', () => {
    const columns = walletBalancesCsvColumns(t);
    const csv = toCsv([entry({ needsReauth: true }), entry({ balanceResult: null })], columns);
    const [, reauth, missing] = csv.split('\r\n');
    expect(reauth).toBe('"Ava Tortuga",');
    expect(missing).toBe('"Ava Tortuga",');
  });

  it('keeps an actual zero balance as 0', () => {
    const csv = toCsv(
      [
        entry({
          balanceResult: { data: 0, fetchedAt: new Date(), fromCache: false, truncated: false },
        }),
      ],
      walletBalancesCsvColumns(t)
    );
    expect(csv.split('\r\n')[1]).toBe('"Ava Tortuga",0');
  });
});
