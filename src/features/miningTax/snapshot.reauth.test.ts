import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import type { CharacterMiningLedger } from './ledger';

// Isolated from snapshot.test.ts: that file exercises the real ledger.ts
// (esiCache-seeded) read path, which cannot produce a `needsReauth: true`
// result without a genuine 401/403 round trip. Mocking `./ledger` directly
// here tests snapshot.ts's own composition — that a per-character
// `needsReauth` is surfaced per character, not collapsed into one flag —
// in isolation from how a ledger read actually fails.
const ledgerMock = vi.hoisted(() => ({ loadAllCharacterLedgers: vi.fn() }));
vi.mock('./ledger', () => ledgerMock);

const CHAR_OK = 1;
const CHAR_LAPSED = 2;

function ledger(overrides: Partial<CharacterMiningLedger>): CharacterMiningLedger {
  return {
    characterId: CHAR_OK,
    characterName: 'Pilot',
    entries: [],
    unclassifiedTypeIds: [],
    needsReauth: false,
    fetchedAt: null,
    fromCache: true,
    ...overrides,
  };
}

beforeEach(async () => {
  vi.clearAllMocks();
  await db.payees.clear();
  await db.miningTaxAssignments.clear();
});

describe('loadMoonMiningTaxSnapshot: reauth surfacing', () => {
  it('reports only the character(s) whose ledger read needed a re-login, not a flag for the whole snapshot', async () => {
    ledgerMock.loadAllCharacterLedgers.mockResolvedValue([
      ledger({ characterId: CHAR_OK, characterName: 'Pilot OK', needsReauth: false }),
      ledger({ characterId: CHAR_LAPSED, characterName: 'Pilot Lapsed', needsReauth: true }),
    ]);

    const { loadMoonMiningTaxSnapshot } = await import('./snapshot');
    const snapshot = await loadMoonMiningTaxSnapshot();

    expect(snapshot.reauthCharacters).toEqual([
      { characterId: CHAR_LAPSED, characterName: 'Pilot Lapsed' },
    ]);
    // Both characters still appear in the roster — a lapsed grant hides
    // nothing about who is tracked.
    expect(snapshot.characters.map((c) => c.characterId).sort()).toEqual([CHAR_OK, CHAR_LAPSED]);
  });

  it('reports no reauth characters when every ledger read succeeded', async () => {
    ledgerMock.loadAllCharacterLedgers.mockResolvedValue([
      ledger({ characterId: CHAR_OK, needsReauth: false }),
    ]);

    const { loadMoonMiningTaxSnapshot } = await import('./snapshot');
    const snapshot = await loadMoonMiningTaxSnapshot();

    expect(snapshot.reauthCharacters).toEqual([]);
  });

  it('still yields rows for stored Assignments of a lapsed character with nothing cached', async () => {
    ledgerMock.loadAllCharacterLedgers.mockResolvedValue([
      ledger({ characterId: CHAR_LAPSED, characterName: 'Pilot Lapsed', needsReauth: true }),
    ]);
    await db.miningTaxAssignments.put({
      id: 'a1',
      characterId: CHAR_LAPSED,
      date: '2026-07-01',
      solarSystemId: 1,
      payeeId: 'p',
      oreLines: [{ typeId: 45490, quantity: 100 }],
      taxPct: 10,
      estimatedValue: 5000000,
      taxOwed: 500000,
      status: 'outstanding',
      updatedAt: 1,
    });

    const { loadMoonMiningTaxSnapshot } = await import('./snapshot');
    const snapshot = await loadMoonMiningTaxSnapshot();

    expect(snapshot.rows.map((r) => r.assignments.map((a) => a.id))).toEqual([['a1']]);
    expect(snapshot.reauthCharacters.map((c) => c.characterId)).toEqual([CHAR_LAPSED]);
  });
});
