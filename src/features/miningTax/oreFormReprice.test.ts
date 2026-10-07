import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord } from '@/db';
import { repriceForOreForm } from './oreFormReprice';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('./pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

const formMock = vi.hoisted(() => ({ compressed: true }));
vi.mock('./oreForm', () => ({ readCompressedOre: async () => formMock.compressed }));

const CHAR = 1;
const TYPE = 45490;

function record(overrides: Partial<MiningTaxAssignmentRecord> = {}): MiningTaxAssignmentRecord {
  return {
    id: 'a1',
    characterId: CHAR,
    date: '2026-09-04',
    solarSystemId: 1,
    payeeId: 'p',
    oreLines: [{ typeId: TYPE, quantity: 100 }],
    taxPct: 10,
    estimatedValue: 1000,
    taxOwed: 100,
    status: 'outstanding',
    updatedAt: 1,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  formMock.compressed = true;
  pricingMock.loadUnitPricesOnDate.mockResolvedValue({
    prices: new Map([[TYPE, 5]]),
    unpriced: new Set(),
    sellFallback: new Set(),
  });
  await db.miningTaxAssignments.clear();
  await db.payees.clear();
});

describe('repriceForOreForm', () => {
  it('re-prices an Outstanding record priced under the other form and marks it raw', async () => {
    formMock.compressed = false;
    await db.miningTaxAssignments.put(record());

    await repriceForOreForm(CHAR);

    const row = await db.miningTaxAssignments.get('a1');
    expect(row).toMatchObject({ estimatedValue: 500, taxOwed: 50, rawOrePriced: true });
    expect(pricingMock.loadUnitPricesOnDate).toHaveBeenCalledWith(
      CHAR,
      [TYPE],
      expect.anything(),
      '2026-09-04',
      false
    );
    expect(syncMock.scheduleSync).toHaveBeenCalledWith(CHAR);
  });

  it('clears the raw marker when flipping back to Compressed', async () => {
    await db.miningTaxAssignments.put(record({ rawOrePriced: true }));

    await repriceForOreForm(CHAR);

    const row = await db.miningTaxAssignments.get('a1');
    expect(row?.estimatedValue).toBe(500);
    expect(row?.rawOrePriced).toBeUndefined();
  });

  it('leaves a record already priced under the current form alone', async () => {
    await db.miningTaxAssignments.put(record());
    await repriceForOreForm(CHAR);
    expect(pricingMock.loadUnitPricesOnDate).not.toHaveBeenCalled();
    expect(syncMock.scheduleSync).not.toHaveBeenCalled();
  });

  it.each(['paid', 'needs-review', 'dismissed'] as const)(
    'never touches a %s record',
    async (status) => {
      formMock.compressed = false;
      await db.miningTaxAssignments.put(record({ status }));
      await repriceForOreForm(CHAR);
      expect((await db.miningTaxAssignments.get('a1'))?.estimatedValue).toBe(1000);
    }
  );

  it('keeps the old value when an ore has no price right now', async () => {
    formMock.compressed = false;
    pricingMock.loadUnitPricesOnDate.mockResolvedValue({
      prices: new Map([[TYPE, 0]]),
      unpriced: new Set([TYPE]),
      sellFallback: new Set(),
    });
    await db.miningTaxAssignments.put(record());

    await repriceForOreForm(CHAR);

    const row = await db.miningTaxAssignments.get('a1');
    expect(row?.estimatedValue).toBe(1000);
    expect(row?.rawOrePriced).toBeUndefined();
  });

  it('keeps a per-ore value override', async () => {
    formMock.compressed = false;
    await db.miningTaxAssignments.put(record({ oreLineValues: { [TYPE]: 777 } }));
    await repriceForOreForm(CHAR);
    expect((await db.miningTaxAssignments.get('a1'))?.estimatedValue).toBe(777);
  });
});
