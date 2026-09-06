import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { createPayee, deletePayee, loadPayees, updatePayee } from './payees';

const syncMock = vi.hoisted(() => ({
  markPayeeDeleted: vi.fn(async () => {}),
  scheduleSync: vi.fn(),
}));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const CHAR_B = 2;

beforeEach(async () => {
  vi.clearAllMocks();
  await db.payees.clear();
});

describe('createPayee', () => {
  it('writes a Payee scoped to the character and schedules a sync', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Some Corp', defaultTaxPct: 10 });

    expect(payee).toMatchObject({ characterId: CHAR_A, name: 'Some Corp', defaultTaxPct: 10 });
    expect(await db.payees.get(payee.id)).toEqual(payee);
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR_A);
  });

  it('omits systemId entirely when not given, rather than writing it as undefined', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Some Corp', defaultTaxPct: 10 });
    expect('systemId' in payee).toBe(false);
  });

  it('keeps two characters’ Payees independent', async () => {
    await createPayee(CHAR_A, { name: 'A Corp', defaultTaxPct: 10 });
    await createPayee(CHAR_B, { name: 'B Corp', defaultTaxPct: 5 });

    expect((await loadPayees(CHAR_A)).map((p) => p.name)).toEqual(['A Corp']);
    expect((await loadPayees(CHAR_B)).map((p) => p.name)).toEqual(['B Corp']);
  });
});

describe('updatePayee', () => {
  it('overwrites name and tax %, bumping updatedAt', async () => {
    const payee = await createPayee(CHAR_A, { name: 'Old Name', defaultTaxPct: 10 });
    const updated = await updatePayee(payee, { name: 'New Name', defaultTaxPct: 15 });

    expect(updated).toMatchObject({ name: 'New Name', defaultTaxPct: 15 });
    expect(updated.updatedAt).toBeGreaterThanOrEqual(payee.updatedAt);
    expect(await db.payees.get(payee.id)).toMatchObject({ name: 'New Name', defaultTaxPct: 15 });
  });

  it('removes systemId when the input no longer carries one', async () => {
    const payee = await createPayee(CHAR_A, { name: 'A', defaultTaxPct: 10, systemId: 30000142 });
    const updated = await updatePayee(payee, { name: 'A', defaultTaxPct: 10 });

    expect('systemId' in updated).toBe(false);
    expect('systemId' in (await db.payees.get(payee.id))!).toBe(false);
  });
});

describe('deletePayee', () => {
  it('tombstones the deletion via markPayeeDeleted', async () => {
    const payee = await createPayee(CHAR_A, { name: 'A', defaultTaxPct: 10 });
    await deletePayee(payee);
    expect(syncMock.markPayeeDeleted).toHaveBeenCalledWith(CHAR_A, payee.id);
  });
});
