import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadMoonMiningTaxSnapshot } from './snapshot';

const MOON_ORE = 45490;

const sdeMock = vi.hoisted(() => ({
  loadMoonOreTypeIds: vi.fn(async () => [MOON_ORE]),
  loadOreAndIceTypeIds: vi.fn(async () => [MOON_ORE]),
}));
vi.mock('@/sde/loadSde', () => sdeMock);

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const LEDGER_KEY = 'miningTax:ledger';

beforeEach(async () => {
  vi.clearAllMocks();
  await db.characters.clear();
  await db.esiCache.clear();
  await db.payees.clear();
  await db.miningTaxAssignments.clear();
});

async function seedCharacter(characterId: number, name: string): Promise<void> {
  await db.characters.put({ characterId, name, ownerHash: 'oh', addedAt: 0 });
}

describe('loadMoonMiningTaxSnapshot', () => {
  it('reports an entry as unassigned with the whole entry as its residual, when nothing covers it', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await db.esiCache.put({
      characterId: CHAR_A,
      key: LEDGER_KEY,
      value: [{ date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE }],
      fetchedAt: 1,
    });

    const snapshot = await loadMoonMiningTaxSnapshot();

    expect(snapshot.rows).toHaveLength(1);
    const [row] = snapshot.rows;
    expect(row.statuses).toEqual(new Set(['unassigned']));
    expect(row.unassignedOreLines).toEqual([{ typeId: MOON_ORE, quantity: 100 }]);
    expect(row.assignments).toEqual([]);
  });

  it('joins an existing Assignment onto its entry and reports only that status', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await db.esiCache.put({
      characterId: CHAR_A,
      key: LEDGER_KEY,
      value: [{ date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE }],
      fetchedAt: 1,
    });
    await db.miningTaxAssignments.put({
      id: 'a1',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: MOON_ORE, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'outstanding',
      updatedAt: 1,
    });

    const snapshot = await loadMoonMiningTaxSnapshot();

    const [row] = snapshot.rows;
    expect(row.statuses).toEqual(new Set(['outstanding']));
    expect(row.unassignedOreLines).toEqual([]);
    expect(row.assignments.map((a) => a.id)).toEqual(['a1']);
  });

  it('re-diffs a stored Assignment against a fresh (grown) ledger read before joining it', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await db.esiCache.put({
      characterId: CHAR_A,
      key: LEDGER_KEY,
      // ESI now reports more than the assignment's own snapshot.
      value: [{ date: '2026-09-04', quantity: 150, solar_system_id: 1, type_id: MOON_ORE }],
      fetchedAt: 1,
    });
    await db.miningTaxAssignments.put({
      id: 'a1',
      characterId: CHAR_A,
      date: '2026-09-04',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: MOON_ORE, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 1000,
      taxOwed: 100,
      status: 'outstanding',
      updatedAt: 1,
    });

    const snapshot = await loadMoonMiningTaxSnapshot();

    // The whole typeId stays claimed by the reviewing Assignment (presence-
    // based coverage, rowStatus.ts) — the growth shows up as `needs-review`,
    // never as a second, separately-assignable "unassigned" residual for the
    // same ore.
    const [row] = snapshot.rows;
    expect(row.statuses).toEqual(new Set(['needs-review']));
    expect(row.unassignedOreLines).toEqual([]);
    expect((await db.miningTaxAssignments.get('a1'))?.reviewDiff).toEqual([
      { typeId: MOON_ORE, before: 100, after: 150 },
    ]);
  });
});
