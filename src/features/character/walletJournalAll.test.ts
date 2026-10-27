import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { loadAllCharactersJournals } from './walletJournalAll';

const loadJournal = vi.hoisted(() => vi.fn());
vi.mock('@/features/character/wallet', () => ({
  loadWalletJournalHistory: loadJournal,
  loadWalletTransactionsHistory: vi.fn(async () => ({ data: [], truncated: false })),
}));
vi.mock('@/features/character/typeNames', () => ({ loadTypeNames: vi.fn(async () => new Map()) }));

const SCOPE = 'esi-wallet.read_character_wallet.v1';

async function seed(id: number, name: string) {
  await db.characters.put({ characterId: id, name, ownerHash: `oh${id}`, addedAt: id });
  await db.tokens.put({
    characterId: id,
    accessToken: 'a',
    refreshToken: 'r',
    expiresAt: Date.now() + 3_600_000,
    scopes: [SCOPE],
  });
}

describe('loadAllCharactersJournals', () => {
  beforeEach(async () => {
    await db.characters.clear();
    await db.tokens.clear();
    loadJournal.mockReset();
    loadJournal.mockImplementation(async (characterId: number) => ({
      cached: { data: [], fetchedAt: new Date(characterId), truncated: false },
      needsReauth: false,
    }));
    await seed(1, 'One');
    await seed(2, 'Two');
    await seed(3, 'Three');
  });

  it('loads only the picked Characters when given a subset', async () => {
    const snapshot = await loadAllCharactersJournals([
      { characterId: 1, name: 'One' },
      { characterId: 3, name: 'Three' },
    ]);
    expect(snapshot.loaded.map((c) => c.characterId)).toEqual([1, 3]);
    expect(loadJournal).not.toHaveBeenCalledWith(2);
    expect(snapshot.loaded[1].fetchedAt).toEqual(new Date(3));
  });

  it('loads every stored Character when none are given', async () => {
    const snapshot = await loadAllCharactersJournals();
    expect(snapshot.loaded.map((c) => c.characterId)).toEqual([1, 2, 3]);
  });
});
