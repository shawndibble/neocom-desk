import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type PayeeRecord } from '@/db';
import { applyDefaultSystems } from './defaultAssignments';
import { useDefaultOptOuts } from './defaultOptOuts';
import { unassign } from './ledgerActions';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn(), setSyncedSetting: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('./pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

const CHAR = 1;
const SYSTEM = 30000142;
const ORE = 45492;

const payee = (overrides: Partial<PayeeRecord> = {}): PayeeRecord => ({
  id: 'landlord',
  characterId: CHAR,
  name: 'Landlord',
  defaultTaxPct: 7,
  hubId: 'amarr',
  defaultSystems: [{ systemId: SYSTEM, from: '2026-10-20' }],
  updatedAt: 1,
  ...overrides,
});

const ledger = (quantity: number, date = '2026-10-21') => ({
  characterId: CHAR,
  entries: [
    { characterId: CHAR, date, solarSystemId: SYSTEM, oreLines: [{ typeId: ORE, quantity }] },
  ],
});

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([db.payees.clear(), db.miningTaxAssignments.clear(), db.settings.clear()]);
  useDefaultOptOuts.setState({ value: [], hydrated: false });
  pricingMock.loadUnitPricesOnDate.mockResolvedValue({
    prices: new Map([[ORE, 100]]),
    unpriced: new Set(),
    sellFallback: new Set(),
  });
});

describe('applyDefaultSystems', () => {
  it('assigns a Default System’s ore to its Payee at the Payee’s rate and hub, marked as a default', async () => {
    await db.payees.put(payee());

    const created = await applyDefaultSystems([ledger(50)]);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      payeeId: 'landlord',
      taxPct: 7,
      oreLines: [{ typeId: ORE, quantity: 50 }],
      estimatedValue: 5000,
      status: 'outstanding',
      override: false,
    });
    expect(created[0].taxOwed).toBeCloseTo(350, 6);
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      [ORE],
      expect.objectContaining({ id: 'amarr' }),
      '2026-10-21',
      true
    );
  });

  it('is forward-only: nothing before the day the system was added', async () => {
    await db.payees.put(payee({ defaultSystems: [{ systemId: SYSTEM, from: '2026-10-22' }] }));
    expect(await applyDefaultSystems([ledger(50)])).toEqual([]);
  });

  it('assigns nothing twice: growth is left to the first Assignment', async () => {
    await db.payees.put(payee());
    await applyDefaultSystems([ledger(50)]);
    expect(await applyDefaultSystems([ledger(80)])).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('leaves an entry the pilot unassigned alone', async () => {
    await db.payees.put(payee());
    const [made] = await applyDefaultSystems([ledger(50)]);

    await unassign([made]);

    expect(await applyDefaultSystems([ledger(50)])).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(0);
  });

  it('leaves an entry something else already covers', async () => {
    await db.payees.put(payee());
    await db.miningTaxAssignments.put({
      id: 'mine',
      characterId: CHAR,
      date: '2026-10-21',
      solarSystemId: SYSTEM,
      payeeId: 'someone',
      oreLines: [{ typeId: ORE, quantity: 10 }],
      taxPct: 5,
      estimatedValue: 0,
      taxOwed: 0,
      status: 'outstanding',
      updatedAt: 1,
    });
    expect(await applyDefaultSystems([ledger(50)])).toEqual([]);
  });

  it('skips a slice it cannot price and tries again on the next load', async () => {
    await db.payees.put(payee());
    pricingMock.loadUnitPricesOnDate.mockRejectedValueOnce(new Error('offline'));
    expect(await applyDefaultSystems([ledger(50)])).toEqual([]);
    expect(await applyDefaultSystems([ledger(50)])).toHaveLength(1);
  });
});
