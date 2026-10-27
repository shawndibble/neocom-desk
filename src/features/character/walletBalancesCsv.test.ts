import { describe, it, expect } from 'vitest';
import { toCsv } from '@/lib/csv';
import type { NetWorthTableRow } from '@/features/netWorth/tableRows';
import { walletBalancesCsvColumns } from './walletBalancesCsv';

const t = (k: string) => k;

function entry(overrides: Partial<NetWorthTableRow> = {}): NetWorthTableRow {
  return {
    characterId: 1,
    characterName: 'Ava Tortuga',
    covered: true,
    needsReauth: false,
    layers: { isk: 1000, assets: 100, escrow: 10, sellOrders: 5, contracts: 0 },
    ...overrides,
  };
}

describe('walletBalancesCsvColumns', () => {
  it('uses the table headers: character, the layers, then net worth', () => {
    expect(walletBalancesCsvColumns(t).map((c) => c.header)).toEqual([
      'wallet.balanceCharacterColumn',
      'wallet.netWorth.layers.isk',
      'wallet.netWorth.layers.assets',
      'wallet.netWorth.layers.escrow',
      'wallet.netWorth.layers.sellOrders',
      'wallet.netWorth.layers.contracts',
      'wallet.netWorth.total',
    ]);
  });

  it('writes raw numbers next to the quoted name, totalling the shown layers', () => {
    const all = toCsv([entry()], walletBalancesCsvColumns(t));
    expect(all.split('\r\n')[1]).toBe('"Ava Tortuga",1000,100,10,5,0,1115');
    const iskOnly = toCsv([entry()], walletBalancesCsvColumns(t, ['isk']));
    expect(iskOnly.split('\r\n')[1]).toBe('"Ava Tortuga",1000,100,10,5,0,1000');
  });

  it('leaves a Character without the permissions blank, never 0', () => {
    const csv = toCsv([entry({ covered: false, layers: null })], walletBalancesCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe('"Ava Tortuga",,,,,,');
  });

  it('blanks the wallet and the total when re-auth is needed', () => {
    const csv = toCsv([entry({ needsReauth: true })], walletBalancesCsvColumns(t));
    expect(csv.split('\r\n')[1]).toBe('"Ava Tortuga",,100,10,5,0,');
  });

  it('keeps an actual zero balance as 0', () => {
    const csv = toCsv(
      [entry({ layers: { isk: 0, assets: 0, escrow: 0, sellOrders: 0, contracts: 0 } })],
      walletBalancesCsvColumns(t)
    );
    expect(csv.split('\r\n')[1]).toBe('"Ava Tortuga",0,0,0,0,0,0');
  });
});
