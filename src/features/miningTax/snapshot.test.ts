import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadMoonMiningTaxSnapshot } from './snapshot';
import { computePayeeBalances } from './balances';
import { flatten } from './groupRows';

const MOON_ORE = 45490;

const sdeMock = vi.hoisted(() => ({
  loadMoonOreTypeIds: vi.fn(async () => [MOON_ORE]),
  loadOreAndIceTypeIds: vi.fn(async () => [MOON_ORE]),
}));
vi.mock('@/sde/loadSde', () => sdeMock);

const syncMock = vi.hoisted(() => ({ scheduleSync: vi.fn() }));
vi.mock('@/sync', () => syncMock);

const CHAR_A = 1;
const CHAR_B = 2;
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
    expect(row.unassignedOreLines).toEqual([]);
    expect(row.assignments.map((a) => a.id)).toEqual(['a1']);
    expect(row.assignments[0].status).toBe('outstanding');
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
    expect(row.assignments[0].status).toBe('needs-review');
    expect(row.unassignedOreLines).toEqual([]);
    expect((await db.miningTaxAssignments.get('a1'))?.reviewDiff).toEqual([
      { typeId: MOON_ORE, before: 100, after: 150 },
    ]);
  });

  it('lists every tracked character, even one with zero entries this refresh', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedCharacter(CHAR_B, 'Pilot B');
    await db.esiCache.put({
      characterId: CHAR_A,
      key: LEDGER_KEY,
      value: [{ date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE }],
      fetchedAt: 1,
    });
    // CHAR_B has no cached ledger row at all — no entries, but still tracked.

    const snapshot = await loadMoonMiningTaxSnapshot();

    expect(snapshot.characters.map((c) => c.characterId).sort()).toEqual([CHAR_A, CHAR_B]);
  });

  describe("aged-out Assignments (ledger entry past ESI's 30-day window)", () => {
    const seedAssignment = (
      id: string,
      date: string,
      status: 'outstanding' | 'paid' | 'dismissed'
    ) =>
      db.miningTaxAssignments.put({
        id,
        characterId: CHAR_A,
        date,
        solarSystemId: 1,
        payeeId: status === 'dismissed' ? undefined : 'p',
        oreLines: [{ typeId: MOON_ORE, quantity: 100 }],
        taxPct: 10,
        estimatedValue: 5000000,
        taxOwed: 500000,
        status,
        updatedAt: 1,
      });

    it('keeps a row for an Assignment with no fresh entry, next to the fresh day', async () => {
      await seedCharacter(CHAR_A, 'Pilot A');
      await db.esiCache.put({
        characterId: CHAR_A,
        key: LEDGER_KEY,
        value: [{ date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE }],
        fetchedAt: 1,
      });
      await seedAssignment('old', '2026-07-01', 'outstanding');

      const { rows } = await loadMoonMiningTaxSnapshot();

      expect(rows.map((r) => r.entry.date).sort()).toEqual(['2026-07-01', '2026-09-04']);
      const old = rows.find((r) => r.entry.date === '2026-07-01')!;
      expect(old.assignments.map((a) => a.id)).toEqual(['old']);
      expect(old.unassignedOreLines).toEqual([]);
      expect(old.entry.oreLines).toEqual([{ typeId: MOON_ORE, quantity: 100 }]);
      const fresh = rows.find((r) => r.entry.date === '2026-09-04')!;
      expect(fresh.assignments).toEqual([]);
    });

    it('does not duplicate a row when the Assignment has a fresh entry', async () => {
      await seedCharacter(CHAR_A, 'Pilot A');
      await db.esiCache.put({
        characterId: CHAR_A,
        key: LEDGER_KEY,
        value: [{ date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE }],
        fetchedAt: 1,
      });
      await seedAssignment('a1', '2026-09-04', 'outstanding');

      const { rows } = await loadMoonMiningTaxSnapshot();

      expect(rows).toHaveLength(1);
    });

    it('counts an aged-out outstanding Assignment in its Payee balance', async () => {
      await seedCharacter(CHAR_A, 'Pilot A');
      const payee = { id: 'p', characterId: CHAR_A, name: 'Vega', defaultTaxPct: 10, updatedAt: 1 };
      await db.payees.put(payee);
      await seedAssignment('old', '2026-07-01', 'outstanding');

      const { rows } = await loadMoonMiningTaxSnapshot();
      const [balance] = computePayeeBalances(flatten(rows), [payee]);

      expect(balance.owed).toBe(500000);
      expect(balance.members).toHaveLength(1);
    });

    it('keeps paid and dismissed status on aged-out rows', async () => {
      await seedCharacter(CHAR_A, 'Pilot A');
      await seedAssignment('paid', '2026-07-01', 'paid');
      await seedAssignment('dis', '2026-07-02', 'dismissed');

      const { rows } = await loadMoonMiningTaxSnapshot();

      const status = Object.fromEntries(
        rows.flatMap((r) => r.assignments.map((a) => [a.id, a.status]))
      );
      expect(status).toEqual({ paid: 'paid', dis: 'dismissed' });
    });
  });
});
