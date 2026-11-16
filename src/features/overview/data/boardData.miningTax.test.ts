import { describe, expect, it, vi } from 'vitest';

const snap = vi.hoisted(() => ({
  characters: [] as { characterId: number; characterName: string }[],
  reauthCharacters: [] as { characterId: number; characterName: string }[],
}));
vi.mock('@/features/miningTax/snapshot', () => ({
  loadMoonMiningTaxSnapshot: async () => ({
    rows: [],
    characters: snap.characters,
    reauthCharacters: snap.reauthCharacters,
    payeesByCharacter: new Map(),
    fetchedAt: null,
  }),
}));

const owed = vi.hoisted(() => ({ balances: [] as unknown[], unassignedCount: 0 }));
vi.mock('@/features/miningTax/owedNow', () => ({
  loadOwedBalances: async () => ({
    balances: owed.balances,
    unassignedCount: owed.unassignedCount,
  }),
}));

const { loadMiningTaxBoard } = await import('./boardData');

const A = { characterId: 1, characterName: 'Krish Mero' };
const B = { characterId: 2, characterName: 'Shadow Ruler' };

describe('loadMiningTaxBoard', () => {
  it('a Character it cannot read among others it can is only left out, and named', async () => {
    snap.characters = [A, B];
    snap.reauthCharacters = [B];
    const board = await loadMiningTaxBoard();
    expect(board.needsReauth).toBe(false);
    expect(board.missingCharacterNames).toEqual(['Shadow Ruler']);
    expect(board.missingCharacterIds).toEqual([2]);
  });

  it('needs a login only when no Character can be read', async () => {
    snap.characters = [A, B];
    snap.reauthCharacters = [A, B];
    expect((await loadMiningTaxBoard()).needsReauth).toBe(true);
  });

  it("reads what is owed from the Tax tab's own balances, Payees owed nothing left out", async () => {
    snap.characters = [A];
    snap.reauthCharacters = [];
    const today = new Date().toISOString().slice(0, 10);
    owed.balances = [
      {
        payee: { id: 'corp', name: 'Bureau' },
        owed: 29_980_000,
        members: [{ assignment: { date: today } }],
      },
      { payee: { id: 'p1', name: 'Friend' }, owed: 0, members: [] },
    ];
    const board = await loadMiningTaxBoard();
    expect(board.unpaidIsk).toBe(29_980_000);
    expect(board.payeeCount).toBe(1);
    expect(board.unassignedCount).toBe(0);
    expect(board.oldestUnpaidDays).toBe(0);
    expect(board.payees).toEqual([
      { payeeId: 'corp', name: 'Bureau', unpaidIsk: 29_980_000, oldestDays: 0, entries: 1 },
    ]);
  });
});
