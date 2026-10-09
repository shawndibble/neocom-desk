import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { ensurePayee, findPayeeByName, MINING_TAX_HREF, parseTaxPct } from './moonTaxPayee';

beforeEach(async () => {
  await db.payees.clear();
});

describe('parseTaxPct', () => {
  it('accepts 0 to 100 with a dot or comma, and nothing else', () => {
    expect(parseTaxPct('12.5')).toBe(12.5);
    expect(parseTaxPct('7,5')).toBe(7.5);
    expect(parseTaxPct('0')).toBe(0);
    expect(parseTaxPct('')).toBeNull();
    expect(parseTaxPct('abc')).toBeNull();
    expect(parseTaxPct('101')).toBeNull();
    expect(parseTaxPct('-1')).toBeNull();
    expect(parseTaxPct('1e1')).toBeNull();
    expect(parseTaxPct('0x10')).toBeNull();
  });
});

describe('ensurePayee', () => {
  it('creates a Payee with the rate as its default', async () => {
    const payee = await ensurePayee(1, ' Moon Corp ', 10);
    expect(payee).toMatchObject({ characterId: 1, name: 'Moon Corp', defaultTaxPct: 10 });
    expect(await db.payees.count()).toBe(1);
  });

  it('reuses a Payee of the same name in any case, taking the new rate', async () => {
    const first = await ensurePayee(1, 'Moon Corp', 10);
    const again = await ensurePayee(1, 'moon corp', 15);
    expect(again.id).toBe(first.id);
    expect(again.name).toBe('Moon Corp');
    expect((await db.payees.get(first.id))?.defaultTaxPct).toBe(15);
    expect(await db.payees.count()).toBe(1);
  });

  it("does not touch another character's Payee of the same name", async () => {
    await ensurePayee(2, 'Moon Corp', 10);
    await ensurePayee(1, 'Moon Corp', 20);
    expect(await db.payees.count()).toBe(2);
  });
});

describe('helpers', () => {
  it('finds by name ignoring case and padding', () => {
    const payees = [{ id: 'a', name: 'Moon Corp' }] as never;
    expect(findPayeeByName(payees, ' MOON corp ')?.id).toBe('a');
    expect(findPayeeByName(payees, 'Other')).toBeUndefined();
  });

  it('links to the Tax tab', () => {
    expect(MINING_TAX_HREF).toBe('/mining/tax');
  });
});
