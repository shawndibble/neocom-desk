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
});
