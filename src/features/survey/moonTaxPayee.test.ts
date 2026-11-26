import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import {
  ensurePayee,
  findOrCreatePayee,
  findPayeeByName,
  MINING_TAX_HREF,
  parseTaxPct,
  PayeeNotInEveError,
} from './moonTaxPayee';

const lookupMock = vi.hoisted(() => ({ lookupPayeeName: vi.fn() }));
vi.mock('@/features/miningTax/payeeLookup', () => ({
  lookupPayeeName: lookupMock.lookupPayeeName,
}));

const MOON_CORP = { id: 98_000_001, name: 'Moon Corp', kind: 'corporation' as const };

beforeEach(async () => {
  vi.clearAllMocks();
  lookupMock.lookupPayeeName.mockResolvedValue({ status: 'found', match: MOON_CORP });
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
  it('creates a Payee linked to the corporation of that name, with the rate as its default', async () => {
    const payee = await ensurePayee(1, ' moon corp ', 10);
    expect(lookupMock.lookupPayeeName).toHaveBeenCalledWith('moon corp');
    expect(payee).toMatchObject({
      characterId: 1,
      name: 'Moon Corp',
      defaultTaxPct: 10,
      entityId: 98_000_001,
      entityKind: 'corporation',
    });
    expect(await db.payees.count()).toBe(1);
  });

  it.each([
    [{ status: 'none' }, 'none'],
    [
      { status: 'several', matches: [MOON_CORP, { ...MOON_CORP, id: 7, kind: 'character' }] },
      'several',
    ],
    [{ status: 'failed' }, 'failed'],
  ])('creates nothing when the lookup answers %o', async (lookup, reason) => {
    lookupMock.lookupPayeeName.mockResolvedValue(lookup);
    const made = ensurePayee(1, 'Moon 1 Planet 2', 10);
    await expect(made).rejects.toBeInstanceOf(PayeeNotInEveError);
    await expect(made).rejects.toMatchObject({ payeeName: 'Moon 1 Planet 2', reason });
    expect(await db.payees.count()).toBe(0);
  });

  it('makes one Payee when two requests race through the lookup', async () => {
    const [a, b] = await Promise.all([
      findOrCreatePayee(1, 'Moon Corp', 10),
      findOrCreatePayee(1, 'Moon Corp', 10),
    ]);
    expect(await db.payees.count()).toBe(1);
    expect(a.payee.id).toBe(b.payee.id);
    expect([a.created, b.created].sort()).toEqual([false, true]);
  });

  it('reuses a Payee of the same name in any case, taking the new rate', async () => {
    const first = await ensurePayee(1, 'Moon Corp', 10);
    lookupMock.lookupPayeeName.mockClear();
    const again = await ensurePayee(1, 'moon corp', 15);
    expect(lookupMock.lookupPayeeName).not.toHaveBeenCalled();
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
