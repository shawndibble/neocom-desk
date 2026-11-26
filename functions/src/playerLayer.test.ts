import { describe, expect, it } from 'vitest';
import {
  claimPlayerCharacters,
  claimPlayerCharactersHandler,
  type PlayerCharacterDoc,
  type PlayerDoc,
  type PlayerLayerDeps,
  type PlayerLayerStore,
  type PlayerTx,
} from './playerLayer.js';
import type { EveTokenClaims } from './verifyEveToken.js';

function memoryStore() {
  const links = new Map<number, PlayerCharacterDoc>();
  const players = new Map<string, PlayerDoc>();
  const store: PlayerLayerStore = {
    async transact(fn) {
      const tx: PlayerTx = {
        getLinks: async (ids) =>
          new Map(ids.flatMap((id) => (links.has(id) ? [[id, links.get(id)!] as const] : []))),
        getPlayers: async (ids) =>
          new Map(ids.flatMap((id) => (players.has(id) ? [[id, players.get(id)!] as const] : []))),
        setLink: (doc) => void links.set(doc.characterId, doc),
        deleteLink: (id) => void links.delete(id),
        setPlayer: (doc) => void players.set(doc.id, doc),
        deletePlayer: (id) => void players.delete(id),
      };
      return fn(tx);
    },
  };
  return { store, links, players };
}

function setup(logged: unknown[] = []) {
  const mem = memoryStore();
  const deps: PlayerLayerDeps = {
    store: mem.store,
    now: () => 1_000,
    verify: async (token) => {
      const m = /^t(\d+):(\w+)$/.exec(token);
      if (!m) throw new Error('bad token secret-detail');
      const claims: EveTokenClaims = {
        characterId: Number(m[1]),
        ownerHash: m[2]!,
        name: 'P',
        scopes: [],
        clientId: 'c',
      };
      return claims;
    },
    log: (...a) => void logged.push(a),
  };
  return { ...mem, deps };
}
const caller = (id: number, hash = 'h') => ({ uid: `char:${id}`, ownerHash: hash });
const tok = (id: number, hash = 'h') => `t${id}:${hash}`;

describe('claimPlayerCharacters', () => {
  it('creates a Player keyed by the lowest member id, with links', async () => {
    const { deps, players, links } = setup();
    const res = await claimPlayerCharacters(deps, caller(30), [tok(30), tok(20), tok(25)]);
    expect(res).toEqual({ playerId: '20', characterIds: [20, 25, 30], dropped: [] });
    expect(players.get('20')).toEqual({
      id: '20',
      characterIds: [20, 25, 30],
      uids: ['char:20', 'char:25', 'char:30'],
      updatedAt: new Date(1_000).toISOString(),
    });
    expect(links.get(25)).toMatchObject({ characterId: 25, playerId: '20', ownerHash: 'h' });
  });

  it('is idempotent on re-claim', async () => {
    const { deps, players, links } = setup();
    await claimPlayerCharacters(deps, caller(1), [tok(1), tok(2)]);
    const before = JSON.stringify([[...players], [...links]]);
    const res = await claimPlayerCharacters(deps, caller(2), [tok(2), tok(1)]);
    expect(res.playerId).toBe('1');
    expect(res.characterIds).toEqual([1, 2]);
    expect(JSON.stringify([[...players], [...links]])).toBe(before);
  });

  it('rejects a call whose tokens do not include the caller', async () => {
    const { deps } = setup();
    await expect(claimPlayerCharacters(deps, caller(9), [tok(1), tok(2)])).rejects.toMatchObject({
      code: 'permission-denied',
    });
    await expect(claimPlayerCharacters(deps, caller(1, 'other'), [tok(1)])).rejects.toMatchObject({
      code: 'permission-denied',
    });
  });

  it('rejects an invalid token opaquely, without logging it', async () => {
    const logged: unknown[] = [];
    const { deps, players } = setup(logged);
    await expect(
      claimPlayerCharacters(deps, caller(1), [tok(1), 'bad-secret-token'])
    ).rejects.toMatchObject({ code: 'unauthenticated' });
    expect(players.size).toBe(0);
    expect(JSON.stringify(logged)).not.toContain('bad-secret-token');
  });

  it('rejects zero, more than 10, and non-string tokens', async () => {
    const { deps } = setup();
    await expect(claimPlayerCharacters(deps, caller(1), [])).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    const eleven = Array.from({ length: 11 }, (_, i) => tok(i + 1));
    await expect(claimPlayerCharacters(deps, caller(1), eleven)).rejects.toMatchObject({
      code: 'invalid-argument',
    });
    await expect(
      claimPlayerCharacters(deps, caller(1), [tok(1), 5 as unknown as string])
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });

  it('drops a link whose ownerHash changed and removes the character from its Player', async () => {
    const { deps, players, links } = setup();
    await claimPlayerCharacters(deps, caller(1), [tok(1), tok(2), tok(3)]);
    const res = await claimPlayerCharacters(deps, caller(1, 'new'), [tok(1, 'new')]);
    expect(res).toEqual({ playerId: '', characterIds: [], dropped: [1] });
    expect(links.has(1)).toBe(false);
    expect(players.get('1')).toMatchObject({ characterIds: [2, 3], uids: ['char:2', 'char:3'] });
    expect(links.get(2)?.playerId).toBe('1');
    expect(links.get(3)?.playerId).toBe('1');
  });

  it('deletes a Player emptied by a drop', async () => {
    const { deps, players } = setup();
    await claimPlayerCharacters(deps, caller(5), [tok(5)]);
    await claimPlayerCharacters(deps, caller(5, 'x'), [tok(5, 'x')]);
    expect(players.size).toBe(0);
  });

  it('merges existing Players when every member is proven in this call', async () => {
    const { deps, players, links } = setup();
    await claimPlayerCharacters(deps, caller(10), [tok(10), tok(11)]);
    await claimPlayerCharacters(deps, caller(5), [tok(5), tok(6)]);
    const res = await claimPlayerCharacters(deps, caller(10), [tok(10), tok(11), tok(5), tok(6)]);
    expect(res).toEqual({ playerId: '5', characterIds: [5, 6, 10, 11], dropped: [] });
    expect([...players.keys()]).toEqual(['5']);
    expect(links.get(10)?.playerId).toBe('5');
  });

  it('refuses unproven merges: a character of a bigger Player stays put', async () => {
    const { deps, players, links } = setup();
    await claimPlayerCharacters(deps, caller(10), [tok(10), tok(11), tok(12)]);
    const res = await claimPlayerCharacters(deps, caller(10), [tok(10), tok(4)]);
    expect(res.playerId).toBe('10');
    expect(res.characterIds).toEqual([10, 11, 12]);
    expect(players.get('10')?.characterIds).toEqual([10, 11, 12]);
    expect(links.get(4)?.playerId).toBe('4');
    expect(players.get('4')?.characterIds).toEqual([4]);
  });
});

describe('claimPlayerCharactersHandler', () => {
  it('reads accessTokens and the caller from the request', async () => {
    const { deps } = setup();
    const handler = claimPlayerCharactersHandler(deps);
    const res = await handler({
      data: { accessTokens: [tok(7)] },
      auth: { uid: 'char:7', token: { ownerHash: 'h' } },
    } as never);
    expect(res).toEqual({ playerId: '7', characterIds: [7], dropped: [] });
    await expect(handler({ data: {}, auth: undefined } as never)).rejects.toMatchObject({
      code: 'unauthenticated',
    });
    await expect(
      handler({
        data: { accessTokens: 'x' },
        auth: { uid: 'char:7', token: { ownerHash: 'h' } },
      } as never)
    ).rejects.toMatchObject({ code: 'invalid-argument' });
  });
});
