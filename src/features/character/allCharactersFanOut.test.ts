import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';
import { fanOutAllCharacters } from './allCharactersFanOut';

const SCOPE = 'esi-test.read.v1';

function char(characterId: number, name = `C${characterId}`) {
  return { characterId, name } as never;
}
function token(characterId: number, scopes: string[]) {
  return {
    characterId,
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 6e5,
    scopes,
  };
}

beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
});

async function seed(rows: { id: number; scopes?: string[] }[]) {
  await db.characters.bulkPut(rows.map((r) => char(r.id)));
  await db.tokens.bulkPut(rows.filter((r) => r.scopes).map((r) => token(r.id, r.scopes!)));
}

describe('fanOutAllCharacters', () => {
  it('skips a scope-missing Character without calling load', async () => {
    await seed([
      { id: 1, scopes: [SCOPE] },
      { id: 2, scopes: ['other'] },
    ]);
    const called: number[] = [];
    const { entries, skipped } = await fanOutAllCharacters({
      scope: SCOPE,
      load: async ({ characterId }) => {
        called.push(characterId);
        return characterId;
      },
    });
    expect(called).toEqual([1]);
    expect(entries).toEqual([1]);
    expect(skipped).toEqual([{ characterId: 2, name: 'C2' }]);
  });

  it('skips a Character with no token at all', async () => {
    await seed([{ id: 1, scopes: [SCOPE] }, { id: 2 }]);
    const { entries, skipped } = await fanOutAllCharacters({
      scope: SCOPE,
      load: async ({ characterId }) => characterId,
    });
    expect(entries).toEqual([1]);
    expect(skipped).toEqual([{ characterId: 2, name: 'C2' }]);
  });

  it('puts a throwing load, and a null load, into skipped without failing the rest', async () => {
    await seed([1, 2, 3, 4].map((id) => ({ id, scopes: [SCOPE] })));
    const { entries, skipped } = await fanOutAllCharacters({
      scope: SCOPE,
      load: async ({ characterId }) => {
        if (characterId === 2) throw new Error('boom');
        if (characterId === 3) return null;
        return characterId;
      },
    });
    expect(entries).toEqual([1, 4]);
    expect(skipped).toEqual([
      { characterId: 2, name: 'C2' },
      { characterId: 3, name: 'C3' },
    ]);
  });

  it('lists no-scope skips before fetch-failed skips', async () => {
    await seed([
      { id: 1, scopes: [SCOPE] },
      { id: 2, scopes: [] },
    ]);
    const { skipped } = await fanOutAllCharacters({
      scope: SCOPE,
      load: async () => {
        throw new Error('x');
      },
    });
    expect(skipped.map((s) => s.characterId)).toEqual([2, 1]);
  });

  it('keeps entries in Character order regardless of completion order', async () => {
    await seed([1, 2, 3].map((id) => ({ id, scopes: [SCOPE] })));
    const { entries } = await fanOutAllCharacters({
      scope: SCOPE,
      load: async ({ characterId }) => {
        await new Promise((r) => setTimeout(r, (4 - characterId) * 10));
        return characterId;
      },
    });
    expect(entries).toEqual([1, 2, 3]);
  });

  it('never exceeds the concurrency cap', async () => {
    const total = ESI_FANOUT_CONCURRENCY * 2 + 3;
    await seed(Array.from({ length: total }, (_, i) => ({ id: i + 1, scopes: [SCOPE] })));
    let inFlight = 0;
    let peak = 0;
    const { entries } = await fanOutAllCharacters({
      scope: SCOPE,
      load: async ({ characterId }) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 2));
        inFlight -= 1;
        return characterId;
      },
    });
    expect(entries).toHaveLength(total);
    expect(peak).toBeLessThanOrEqual(ESI_FANOUT_CONCURRENCY);
    expect(peak).toBeGreaterThan(1);
  });

  it('without a scope, skips no pre-check and fetches everyone', async () => {
    await seed([{ id: 1 }, { id: 2, scopes: [] }]);
    const { entries, skipped } = await fanOutAllCharacters({
      load: async ({ characterId }) => characterId,
    });
    expect(entries).toEqual([1, 2]);
    expect(skipped).toEqual([]);
  });

  it('limits to the given Characters when `characters` is passed', async () => {
    await seed([1, 2, 3].map((id) => ({ id, scopes: [SCOPE] })));
    const { entries } = await fanOutAllCharacters({
      scope: SCOPE,
      characters: [{ characterId: 3, name: 'C3' }],
      load: async ({ characterId }) => characterId,
    });
    expect(entries).toEqual([3]);
  });
});
