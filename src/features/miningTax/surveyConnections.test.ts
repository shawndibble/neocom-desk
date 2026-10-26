import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { SurveyConnection } from '@/engine/miningTax/surveyConnection';
import { createPayee } from './payees';
import {
  applySurveyConnections,
  refreshSurveyConnection,
  removeSurveyConnection,
  restoreSurveyConnections,
  startSurveyConnection,
  surveyMoonOreTypeIds,
  useSurveyConnections,
} from './surveyConnections';
import { tagAsMoonOre } from './typeOverrides';

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn(), setSyncedSetting: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const pricingMock = vi.hoisted(() => ({ loadUnitPricesOnDate: vi.fn() }));
vi.mock('./pricing', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./pricing')>()),
  loadUnitPricesOnDate: pricingMock.loadUnitPricesOnDate,
}));

vi.mock('@/sde/loadSde', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/sde/loadSde')>()),
  loadMoonOreTypeIds: () => Promise.resolve([45492]),
  loadTypes: () =>
    Promise.resolve({
      45492: { name: 'Bitumens' },
      90001: { name: 'Unpublished Goo' },
      1230: { name: 'Veldspar' },
    }),
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

describe('startSurveyConnection', () => {
  it('stops every other connection, on any Character, and resolves to what it replaced', async () => {
    const mine = connection({ surveyId: 'a', untilMs: Date.now() + 3_600_000 });
    const alt = connection({ surveyId: 'b', characterId: 2, untilMs: Date.now() + 3_600_000 });
    await restoreSurveyConnections([mine, alt]);
    const next = connection({ surveyId: 'c' });

    expect(await startSurveyConnection(next)).toEqual([mine, alt]);
    expect(useSurveyConnections.getState().value).toEqual([next]);

    await restoreSurveyConnections([mine, alt]);
    expect(useSurveyConnections.getState().value).toEqual([mine, alt]);
  });
});

describe('refreshSurveyConnection', () => {
  it('saves onto a running connection but never brings back a stopped one', async () => {
    const running = connection({ untilMs: Date.now() + 3_600_000 });
    await startSurveyConnection(running);
    const moved = { ...running, untilMs: running.untilMs + 60_000 };
    await refreshSurveyConnection(moved);
    expect(useSurveyConnections.getState().value).toEqual([moved]);

    await startSurveyConnection({ ...running, surveyId: 'other' });
    await refreshSurveyConnection(moved);
    expect(useSurveyConnections.getState().value.map((c) => c.surveyId)).toEqual(['other']);
  });
});

describe('applySurveyConnections', () => {
  it('assigns the moon’s unassigned ore to the connected Payee at the survey’s rate', async () => {
    const payee = await createPayee(CHAR, { name: 'Moon Corp', defaultTaxPct: 5 });
    await startSurveyConnection(connection({ payeeId: payee.id }));

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
    await startSurveyConnection(connection({ payeeId: payee.id }));
    await applySurveyConnections([ledger(50)], NOW);

    expect(await applySurveyConnections([ledger(80)], NOW)).toEqual([]);
    expect(await db.miningTaxAssignments.count()).toBe(1);
  });

  it('skips a connection whose Payee was deleted', async () => {
    await startSurveyConnection(connection({ payeeId: 'gone' }));
    expect(await applySurveyConnections([ledger(50)], NOW)).toEqual([]);
  });

  it('does nothing once the connection is removed', async () => {
    const payee = await createPayee(CHAR, { name: 'Moon Corp', defaultTaxPct: 5 });
    await startSurveyConnection(connection({ payeeId: payee.id }));
    await removeSurveyConnection('s1', CHAR);
    expect(await applySurveyConnections([ledger(50)], NOW)).toEqual([]);
  });
});

describe('surveyMoonOreTypeIds', () => {
  it('finds the moon ores among the scanned names, ore the pilot tagged as moon ore included', async () => {
    await tagAsMoonOre(90001);
    expect(await surveyMoonOreTypeIds(['Bitumens', 'Veldspar', 'Unpublished Goo'])).toEqual([
      45492, 90001,
    ]);
  });
});
