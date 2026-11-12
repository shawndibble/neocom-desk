import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import {
  accountCorpReaders,
  corporationsReading,
  corpReadersFor,
  type AccountCorpAccess,
  type CorpCapability,
} from './corpReadAccess';

const server = mswServer();
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.characters.clear();
  await db.tokens.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
});

/** A Character in `corporationId` whose gate opens exactly `capabilities`. */
function reader(
  characterId: number,
  corporationId: number,
  capabilities: readonly CorpCapability[]
): AccountCorpAccess {
  return {
    characterId,
    access: { corporationId, can: (capability) => capabilities.includes(capability) },
  };
}

describe('corpReadersFor', () => {
  it('names one reader per corporation, only among Characters who can read it', () => {
    const readers = corpReadersFor(
      [
        reader(1, 500, []),
        reader(2, 500, ['canReadIndustry']),
        reader(3, 500, ['canReadIndustry']),
        reader(4, 600, ['canReadStructures']),
      ],
      'canReadIndustry'
    );
    expect(readers).toEqual(new Map([[500, 2]]));
  });

  it('prefers the given Character when it can read its corporation', () => {
    const accounts = [reader(2, 500, ['canReadIndustry']), reader(3, 500, ['canReadIndustry'])];
    expect(corpReadersFor(accounts, 'canReadIndustry', 3).get(500)).toBe(3);
  });

  it('ignores a preferred Character that cannot read', () => {
    const accounts = [reader(2, 500, ['canReadIndustry']), reader(3, 500, [])];
    expect(corpReadersFor(accounts, 'canReadIndustry', 3).get(500)).toBe(2);
  });

  it('counts the corporations readable for any of several capabilities once each', () => {
    const accounts = [
      reader(1, 500, ['canReadStructures']),
      reader(2, 500, ['canReadIndustry']),
      reader(3, 600, ['canReadIndustry']),
      reader(4, 700, ['canReadWallet']),
    ];
    expect(corporationsReading(accounts, ['canReadStructures', 'canReadIndustry'])).toBe(2);
    expect(corporationsReading(accounts, ['canReadMembers'])).toBe(0);
  });

  it('reads every player corporation for an ungated read (no capability)', () => {
    const accounts = [
      reader(1, 500, []),
      reader(2, 600, ['canReadWallet']),
      reader(3, 600, []),
      reader(4, 1000125, []),
    ];
    expect(corporationsReading(accounts, [])).toBe(2);
    expect(corpReadersFor(accounts, null, 3)).toEqual(
      new Map([
        [500, 1],
        [600, 3],
      ])
    );
  });
});

describe('accountCorpReaders', () => {
  const ROLES_SCOPE = 'esi-characters.read_corporation_roles.v1';
  const STRUCTURES_SCOPE = 'esi-corporations.read_structures.v1';

  async function seed(characterId: number, scopes: string[]) {
    await db.characters.put({
      characterId,
      name: `Pilot ${characterId}`,
      ownerHash: 'oh',
      addedAt: characterId,
    });
    await db.tokens.put({
      characterId,
      accessToken: 'at',
      refreshToken: 'rt',
      expiresAt: Date.now() + 6e5,
      scopes,
    });
  }

  function inCorp(characterId: number, corporationId: number) {
    return http.get(`${ESI_BASE_URL}/characters/${characterId}`, () =>
      HttpResponse.json({
        name: 'x',
        corporation_id: corporationId,
        birthday: '2020-01-01T00:00:00Z',
        gender: 'male',
        race_id: 1,
        bloodline_id: 1,
      })
    );
  }

  function roles(characterId: number, held: string[]) {
    return http.get(`${ESI_BASE_URL}/characters/${characterId}/roles`, () =>
      HttpResponse.json({ roles: held })
    );
  }

  it('reads each corporation once, in account order, skipping a Character without the scope or with unknown roles', async () => {
    await seed(1, [ROLES_SCOPE, STRUCTURES_SCOPE]);
    await seed(2, [ROLES_SCOPE, STRUCTURES_SCOPE]);
    await seed(3, [ROLES_SCOPE]); // Station Manager without the structures grant.
    await seed(4, [ROLES_SCOPE, STRUCTURES_SCOPE]); // Roles read fails: standing unknown.
    await seed(5, [ROLES_SCOPE, STRUCTURES_SCOPE]);
    server.use(
      inCorp(1, 500),
      inCorp(2, 500),
      inCorp(3, 600),
      inCorp(4, 700),
      inCorp(5, 800),
      roles(1, ['Station_Manager']),
      roles(2, ['Station_Manager']),
      roles(3, ['Station_Manager']),
      http.get(`${ESI_BASE_URL}/characters/4/roles`, () => new HttpResponse(null, { status: 500 })),
      roles(5, ['Director'])
    );

    const readers = await accountCorpReaders('canReadStructures');
    expect([...readers]).toEqual([
      [500, 1],
      [800, 5],
    ]);
    expect((await accountCorpReaders('canReadStructures', 2)).get(500)).toBe(2);
  });
});
