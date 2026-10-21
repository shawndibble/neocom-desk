import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { createPayee } from './payees';
import {
  applySurveyConnections,
  removeSurveyConnection,
  saveSurveyConnection,
  useSurveyConnections,
} from './surveyConnections';

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
const NOW = Date.UTC(2026, 9, 21, 12);

function connection(overrides: Partial<SurveyConnection> = {}): SurveyConnection {
  return {
    surveyId: 's1',
    characterId: CHAR,
    payeeId: 'p1',
    payeeName: 'Moon Corp',
    taxPct: 10,
    systemId: SYSTEM,
    typeIds: [ORE],
    fromDate: '2026-10-21',
    untilMs: NOW + 60 * 60 * 1000,
    expiresAt: NOW + 7 * 24 * 60 * 60 * 1000,
    connectedAt: NOW,
    ...overrides,
  };
}

const ledger = (quantity: number) => ({
  characterId: CHAR,
  entries: [
    {
      characterId: CHAR,
      date: '2026-10-21',
      solarSystemId: SYSTEM,
      oreLines: [{ typeId: ORE, quantity }],
    },
  ],
});

beforeEach(async () => {
  await Promise.all([db.payees.clear(), db.miningTaxAssignments.clear(), db.settings.clear()]);
  useSurveyConnections.setState({ value: [], hydrated: false });
  pricingMock.loadUnitPricesOnDate.mockResolvedValue({
    prices: new Map([[ORE, 100]]),
    unpriced: new Set(),
    sellFallback: new Set(),
  });
});

describe('applySurveyConnections', () => {
  it('assigns the moon’s unassigned ore to the connected Payee at the survey’s rate', async () => {
    const payee = await createPayee(CHAR, { name: 'Moon Corp', defaultTaxPct: 5 });
    await saveSurveyConnection(connection({ payeeId: payee.id }));

    const created = await applySurveyConnections([ledger(50)], NOW);

    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      payeeId: payee.id,
      taxPct: 10,
      oreLines: [{ typeId: ORE, quantity: 50 }],
      estimatedValue: 5000,
      taxOwed: 500,
      status: 'outstanding',
    });
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('assigns nothing twice: a second pass leaves growth to the first Assignment', async () => {
    const payee = await createPayee(CHAR, { name: 'Moon Corp', defaultTaxPct: 5 });
    await saveSurveyConnection(connection({ payeeId: payee.id }));
    await applySurveyConnections([ledger(50)], NOW);

    expect(await applySurveyConnections([ledger(80)], NOW)).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('skips a connection whose Payee was deleted', async () => {
    await saveSurveyConnection(connection({ payeeId: 'gone' }));
    expect(await applySurveyConnections([ledger(50)], NOW)).toEqual([]);
  });

  it('does nothing once the connection is removed', async () => {
    const payee = await createPayee(CHAR, { name: 'Moon Corp', defaultTaxPct: 5 });
    await saveSurveyConnection(connection({ payeeId: payee.id }));
    await removeSurveyConnection('s1', CHAR);
    expect(await applySurveyConnections([ledger(50)], NOW)).toEqual([]);
  });
});
