import { describe, expect, it } from 'vitest';
import { corpPayAccount, corpPayAccounts } from './corpPayAccount';

const t = (key: string, opts?: Record<string, unknown>) =>
  opts ? `${key} ${JSON.stringify(opts)}` : key;

describe('corpPayAccounts (#6204)', () => {
  it('names every division the book reads, in order', () => {
    expect(corpPayAccounts([1, 3], { 3: 'MOON TAXES' }, t)).toEqual([
      'miningTax.corpBook.pay.masterWallet',
      'MOON TAXES',
    ]);
  });
});

describe('corpPayAccount (#6161)', () => {
  it("names the Account by the corp's own name when the book holds one", () => {
    expect(corpPayAccount(5, { 5: 'MOON TAXES' }, t)).toBe('MOON TAXES');
    expect(corpPayAccount(1, { 1: 'Main' }, t)).toBe('Main');
  });

  it('falls back to Master Wallet for division 1 and the numbered division otherwise', () => {
    expect(corpPayAccount(1, undefined, t)).toBe('miningTax.corpBook.pay.masterWallet');
    expect(corpPayAccount(5, { 2: 'Other' }, t)).toBe(
      'miningTax.corpBook.pay.division {"division":5}'
    );
  });
});
