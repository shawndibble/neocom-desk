import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db, type MiningTaxAssignmentRecord, type PayeeRecord } from '@/db';
import { useDefaultOptOuts } from '../defaultOptOuts';
import { applyBookAutoAssign, type BookAutoAssignTarget } from './bookAutoAssign';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn(), setSyncedSetting: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('../pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

const CHAR = 1;
const CORP = 98000001;
const SYSTEM = 30000142;
const ORE = 45492;
const DAY = '2026-11-25';
const NOW = '2026-11-25T12:00:00.000Z';

const book: BookAutoAssignTarget = {
  corporationId: CORP,
  corpName: 'Moon Corp',
  characterIds: [CHAR],
  memberCharacterIds: [CHAR],
  startDate: '2026-11-01',
  graceHours: 0.5,
  lastSyncedAt: '2026-11-25T11:00:00.000Z',
  rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-11-01' }],
  miners: [{ id: 'm1', characterIds: [CHAR], mainCharacterId: CHAR }],
  observed: [
    {
      characterId: CHAR,
      recordedCorporationId: CORP,
      structureId: 1022,
      date: DAY,
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ORE, quantity: 100 }],
    },
  ],
  structureNames: { 1022: 'Moon Corp Athanor' },
  hubId: 'jita',
};

const entries = [
  {
    characterId: CHAR,
    date: DAY,
    solarSystemId: SYSTEM,
    oreLines: [{ typeId: ORE, quantity: 100 }],
  },
];

const landlord: PayeeRecord = {
  id: 'landlord',
  characterId: CHAR,
  name: 'Landlord',
  defaultTaxPct: 7,
  defaultSystems: [{ systemId: SYSTEM, from: '2026-11-01' }],
  updatedAt: 1,
};

const byDefault: MiningTaxAssignmentRecord = {
  id: 'default-1',
  characterId: CHAR,
  date: DAY,
  solarSystemId: SYSTEM,
  payeeId: 'landlord',
  oreLines: [{ typeId: ORE, quantity: 100 }],
  taxPct: 7,
  estimatedValue: 10000,
  taxOwed: 700,
  status: 'outstanding',
  override: false,
  updatedAt: 1,
};

beforeEach(async () => {
  vi.clearAllMocks();
  await Promise.all([
    db.payees.clear(),
    db.miningTaxAssignments.clear(),
    db.miningTaxRecordChanges.clear(),
    db.settings.clear(),
  ]);
  useDefaultOptOuts.setState({ value: [], hydrated: false });
  pricingMock.loadUnitPricesOnDate.mockResolvedValue({
    prices: new Map([[ORE, 100]]),
    unpriced: new Set(),
    sellFallback: new Set(),
  });
});

describe('applyBookAutoAssign', () => {
  it('creates the corp Payee and assigns the ore at the book rate with the refinery label', async () => {
    const { created } = await applyBookAutoAssign([book], entries, NOW);
    expect(created).toHaveLength(1);
    const payee = await db.payees.get(created[0]!.payeeId!);
    expect(payee).toMatchObject({ entityId: CORP, entityKind: 'corporation', hubId: 'jita' });
    expect(created[0]).toMatchObject({
      taxPct: 10,
      taxOwed: 1000,
      label: 'Moon Corp Athanor',
      oreLines: [{ typeId: ORE, quantity: 100 }],
      status: 'outstanding',
    });
    expect(created[0]).not.toHaveProperty('override');
  });

  it('writes one autoAssign Record Change per auto-assign', async () => {
    const { created } = await applyBookAutoAssign([book], entries, NOW);
    const changes = await db.miningTaxRecordChanges.toArray();
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      id: `autoAssign:${created[0]!.id}`,
      reason: 'autoAssign',
      characterId: CHAR,
      date: DAY,
      corporationId: CORP,
      minerId: 'm1',
      assignments: [
        {
          assignmentId: created[0]!.id,
          before: null,
          after: { payeeId: created[0]!.payeeId, taxPct: 10 },
        },
      ],
    });
  });

  it('overrides a Default-System assignment to another Payee and records it', async () => {
    await db.payees.put(landlord);
    await db.miningTaxAssignments.put(byDefault);
    const { created } = await applyBookAutoAssign([book], entries, NOW);
    expect(await db.miningTaxAssignments.get('default-1')).toBeUndefined();
    expect(created).toHaveLength(1);
    const [change] = await db.miningTaxRecordChanges.toArray();
    expect(change?.assignments?.[0]).toMatchObject({
      assignmentId: 'default-1',
      before: { payeeId: 'landlord', taxPct: 7 },
      after: null,
    });
  });

  it('leaves a hand-made assignment alone', async () => {
    await db.payees.put(landlord);
    await db.miningTaxAssignments.put({ ...byDefault, override: undefined });
    expect((await applyBookAutoAssign([book], entries, NOW)).created).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(1);
    expect(await db.miningTaxRecordChanges.count()).toBe(0);
  });

  it('does nothing a second time', async () => {
    await applyBookAutoAssign([book], entries, NOW);
    expect((await applyBookAutoAssign([book], entries, NOW)).created).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(1);
    expect(await db.payees.count()).toBe(1);
  });
});
