import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadAllCharacterLedgers } from './ledger';

const MOON_ORE = 45490; // Zeolites
const ORDINARY_ORE = 1230; // Veldspar — recognized, not moon ore
const UNKNOWN_TYPE = 999999; // recognized by neither list — allowlist gap

const sdeMock = vi.hoisted(() => ({
  loadMoonOreTypeIds: vi.fn(async () => [MOON_ORE]),
  loadOreAndIceTypeIds: vi.fn(async () => [MOON_ORE, ORDINARY_ORE]),
}));
vi.mock('@/sde/loadSde', () => sdeMock);

const CHAR_A = 1;
const CHAR_B = 2;
const LEDGER_KEY = 'miningTax:ledger';

beforeEach(async () => {
  vi.clearAllMocks();
  sdeMock.loadMoonOreTypeIds.mockResolvedValue([MOON_ORE]);
  sdeMock.loadOreAndIceTypeIds.mockResolvedValue([MOON_ORE, ORDINARY_ORE]);
  await db.characters.clear();
  await db.esiCache.clear();
});

async function seedCharacter(characterId: number, name: string): Promise<void> {
  await db.characters.put({ characterId, name, ownerHash: 'oh', addedAt: 0 });
}

async function seedLedger(characterId: number, rows: unknown[]): Promise<void> {
  await db.esiCache.put({ characterId, key: LEDGER_KEY, value: rows, fetchedAt: 1 });
}

describe('loadAllCharacterLedgers', () => {
  it('returns [] when no characters are tracked', async () => {
    expect(await loadAllCharacterLedgers()).toEqual([]);
  });

  it('groups moon ore into entries and reports ordinary ore as neither entry nor unclassified', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedLedger(CHAR_A, [
      { date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE },
      { date: '2026-09-04', quantity: 500, solar_system_id: 1, type_id: ORDINARY_ORE },
    ]);

    const [ledger] = await loadAllCharacterLedgers();

    expect(ledger.entries).toEqual([
      {
        characterId: CHAR_A,
        date: '2026-09-04',
        solarSystemId: 1,
        oreLines: [{ typeId: MOON_ORE, quantity: 100 }],
      },
    ]);
    expect(ledger.unclassifiedTypeIds).toEqual([]);
  });

  it('surfaces a type_id recognized by neither list as unclassified, never silently dropped', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedLedger(CHAR_A, [
      { date: '2026-09-04', quantity: 100, solar_system_id: 1, type_id: MOON_ORE },
      { date: '2026-09-04', quantity: 1, solar_system_id: 1, type_id: UNKNOWN_TYPE },
    ]);

    const [ledger] = await loadAllCharacterLedgers();

    expect(ledger.unclassifiedTypeIds).toEqual([UNKNOWN_TYPE]);
  });

  it('reads every tracked character independently, one ledger each', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    await seedCharacter(CHAR_B, 'Pilot B');
    await seedLedger(CHAR_A, [
      { date: '2026-09-04', quantity: 10, solar_system_id: 1, type_id: MOON_ORE },
    ]);
    await seedLedger(CHAR_B, [
      { date: '2026-09-05', quantity: 20, solar_system_id: 2, type_id: MOON_ORE },
    ]);

    const ledgers = await loadAllCharacterLedgers();

    const a = ledgers.find((l) => l.characterId === CHAR_A);
    const b = ledgers.find((l) => l.characterId === CHAR_B);
    expect(a?.entries[0].oreLines).toEqual([{ typeId: MOON_ORE, quantity: 10 }]);
    expect(b?.entries[0].oreLines).toEqual([{ typeId: MOON_ORE, quantity: 20 }]);
  });

  it('reports an empty ledger (no cached row, no live call reachable) rather than throwing', async () => {
    await seedCharacter(CHAR_A, 'Pilot A');
    const [ledger] = await loadAllCharacterLedgers();
    expect(ledger.entries).toEqual([]);
    expect(ledger.fetchedAt).toBeNull();
  });
});
