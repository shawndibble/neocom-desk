import { describe, expect, it, vi, beforeEach } from 'vitest';
import { verifyEveAccessToken } from './verifyEveToken.js';
import {
  buildDeviceRegistration,
  parseRegisterDeviceInput,
  type RegisterDeviceInput,
} from './registerDevice.js';

vi.mock('./verifyEveToken.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./verifyEveToken.js')>();
  return { ...actual, verifyEveAccessToken: vi.fn() };
});

const verifyMock = vi.mocked(verifyEveAccessToken);
const opts = {} as Parameters<typeof verifyEveAccessToken>[1];

const PROJECTION_ROW = {
  eventId: 'industryJobComplete',
  occurrenceKey: '1:industryJobComplete:987',
  fireAt: 1_700_000_000_000,
  title: 'Industry job complete',
  body: 'Pilot finished the job.',
};

describe('parseRegisterDeviceInput', () => {
  it('accepts a well-formed payload', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [{ characterId: 1, accessToken: 'a', projectionRows: [] }],
    });
    expect(input).toEqual({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [{ characterId: 1, accessToken: 'a', projectionRows: [] }],
    });
  });

  describe('quietHours (issue #4566)', () => {
    const base = {
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [{ characterId: 1, accessToken: 'a', projectionRows: [] }],
    };
    const window = { start: '22:00', end: '07:00', timeZone: 'Europe/Berlin', allowAttacks: true };

    it('parses a window, and null (clear), and leaves absent absent', () => {
      expect(parseRegisterDeviceInput({ ...base, quietHours: window }).quietHours).toEqual(window);
      expect(parseRegisterDeviceInput({ ...base, quietHours: null }).quietHours).toBeNull();
      expect('quietHours' in parseRegisterDeviceInput(base)).toBe(false);
    });

    it('rejects a bad time or zone instead of storing it', () => {
      expect(() =>
        parseRegisterDeviceInput({ ...base, quietHours: { ...window, start: '25:00' } })
      ).toThrow(/quietHours/);
      expect(() =>
        parseRegisterDeviceInput({ ...base, quietHours: { ...window, timeZone: 'Nowhere/Land' } })
      ).toThrow(/quietHours/);
    });
  });

  it('accepts projection rows on a character entry', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [{ characterId: 1, accessToken: 'a', projectionRows: [PROJECTION_ROW] }],
    });
    expect(input.characters[0].projectionRows).toEqual([PROJECTION_ROW]);
  });

  it.each([
    ['a slash', 'device/1'],
    ['a dot path segment', '..'],
    ['an over-long id', 'a'.repeat(129)],
  ])(
    'rejects a deviceId containing %s — it becomes a Firestore doc id and a row id prefix',
    (_, deviceId) => {
      expect(() =>
        parseRegisterDeviceInput({
          deviceId,
          fcmToken: 'fcm-token',
          characters: [{ characterId: 1, accessToken: 'a', projectionRows: [] }],
        })
      ).toThrow(/deviceId/);
    }
  );

  it('parses eveTypes sorted and de-duplicated', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [
        { characterId: 1, accessToken: 'a', projectionRows: [], eveTypes: ['B', 'A', 'B'] },
      ],
    });
    expect(input.characters[0].eveTypes).toEqual(['A', 'B']);
  });

  it.each([
    ['a non-array', 'StructureDestroyed'],
    ['an empty string entry', ['']],
    ['a non-string entry', [7]],
    ['too many entries', Array.from({ length: 201 }, (_, i) => `T${i}`)],
  ])('rejects eveTypes that is %s', (_, eveTypes) => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'device-1',
        fcmToken: 'fcm-token',
        characters: [{ characterId: 1, accessToken: 'a', projectionRows: [], eveTypes }],
      })
    ).toThrow(/eveTypes/);
  });

  describe('server-pushed events (issue #5121)', () => {
    const character = { characterId: 1, accessToken: 'a', projectionRows: [] };

    it('parses serverEvents sorted and de-duplicated, and serverInputs', () => {
      const input = parseRegisterDeviceInput({
        deviceId: 'device-1',
        fcmToken: 'fcm-token',
        characters: [
          {
            ...character,
            serverEvents: ['shipLost', 'priceAlertTriggered', 'shipLost'],
            serverInputs: { incursionNearbyJumps: 5 },
          },
        ],
      });
      expect(input.characters[0].serverEvents).toEqual(['priceAlertTriggered', 'shipLost']);
      expect(input.characters[0].serverInputs).toEqual({ incursionNearbyJumps: 5 });
    });

    it('leaves both absent for an older client', () => {
      const input = parseRegisterDeviceInput({
        deviceId: 'device-1',
        fcmToken: 'fcm-token',
        characters: [character],
      });
      expect(input.characters[0].serverEvents).toBeUndefined();
      expect(input.characters[0].serverInputs).toBeUndefined();
    });

    it('rejects a malformed list', () => {
      expect(() =>
        parseRegisterDeviceInput({
          deviceId: 'device-1',
          fcmToken: 'fcm-token',
          characters: [{ ...character, serverEvents: 'shipLost' }],
        })
      ).toThrow(/serverEvents/);
    });
  });

  it('accepts the client fallback deviceId shape (base36 time + random)', () => {
    expect(
      parseRegisterDeviceInput({
        deviceId: 'lz3k9x2a-4fzyo82mw5l',
        fcmToken: 'fcm-token',
        characters: [{ characterId: 1, accessToken: 'a', projectionRows: [] }],
      }).deviceId
    ).toBe('lz3k9x2a-4fzyo82mw5l');
  });

  it('rejects a character entry missing projectionRows', () => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'd',
        fcmToken: 'f',
        characters: [{ characterId: 1, accessToken: 'a' }],
      })
    ).toThrow();
  });

  it.each(['eventId', 'occurrenceKey', 'fireAt', 'title', 'body'])(
    'rejects a projection row missing %s',
    (field) => {
      const row = { ...PROJECTION_ROW, [field]: undefined };
      expect(() =>
        parseRegisterDeviceInput({
          deviceId: 'd',
          fcmToken: 'f',
          characters: [{ characterId: 1, accessToken: 'a', projectionRows: [row] }],
        })
      ).toThrow();
    }
  );

  it('rejects a projection row with a non-finite fireAt', () => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'd',
        fcmToken: 'f',
        characters: [
          {
            characterId: 1,
            accessToken: 'a',
            projectionRows: [{ ...PROJECTION_ROW, fireAt: NaN }],
          },
        ],
      })
    ).toThrow();
  });

  it('rejects a projection row with an empty title', () => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'd',
        fcmToken: 'f',
        characters: [
          { characterId: 1, accessToken: 'a', projectionRows: [{ ...PROJECTION_ROW, title: '' }] },
        ],
      })
    ).toThrow();
  });

  it('carries an optional eveType through on a projection row', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'd',
      fcmToken: 'f',
      characters: [
        {
          characterId: 1,
          accessToken: 'a',
          projectionRows: [{ ...PROJECTION_ROW, eveType: 'StructureLostShields' }],
        },
      ],
    });
    expect(input.characters[0].projectionRows[0].eveType).toBe('StructureLostShields');
  });

  it('omits eveType from a projection row that has none', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'd',
      fcmToken: 'f',
      characters: [{ characterId: 1, accessToken: 'a', projectionRows: [PROJECTION_ROW] }],
    });
    expect(input.characters[0].projectionRows[0].eveType).toBeUndefined();
  });

  it('rejects a projection row whose eveType is not a string', () => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'd',
        fcmToken: 'f',
        characters: [
          {
            characterId: 1,
            accessToken: 'a',
            projectionRows: [{ ...PROJECTION_ROW, eveType: 42 }],
          },
        ],
      })
    ).toThrow();
  });

  it('accepts an empty-string body on a projection row', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'd',
      fcmToken: 'f',
      characters: [
        { characterId: 1, accessToken: 'a', projectionRows: [{ ...PROJECTION_ROW, body: '' }] },
      ],
    });
    expect(input.characters[0].projectionRows[0].body).toBe('');
  });

  it('rejects a non-object payload', () => {
    expect(() => parseRegisterDeviceInput(undefined)).toThrow();
  });

  it('rejects a payload missing deviceId', () => {
    expect(() => parseRegisterDeviceInput({})).toThrow();
  });

  it('rejects an empty deviceId', () => {
    expect(() =>
      parseRegisterDeviceInput({ deviceId: '', fcmToken: 'f', characters: [] })
    ).toThrow();
  });

  it('rejects an empty fcmToken', () => {
    expect(() =>
      parseRegisterDeviceInput({ deviceId: 'd', fcmToken: '', characters: [] })
    ).toThrow();
  });

  it('rejects an empty characters array', () => {
    expect(() =>
      parseRegisterDeviceInput({ deviceId: 'd', fcmToken: 'f', characters: [] })
    ).toThrow();
  });

  it('rejects a character entry missing accessToken', () => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'd',
        fcmToken: 'f',
        characters: [{ characterId: 1 }],
      })
    ).toThrow();
  });

  it('rejects a characterId that is not a number', () => {
    expect(() =>
      parseRegisterDeviceInput({
        deviceId: 'd',
        fcmToken: 'f',
        characters: [{ characterId: '1', accessToken: 'a' }],
      })
    ).toThrow();
  });
});

describe('buildDeviceRegistration', () => {
  const input: RegisterDeviceInput = {
    deviceId: 'device-1',
    fcmToken: 'fcm-token',
    characters: [
      {
        characterId: 1,
        accessToken: 'token-1',
        projectionRows: [PROJECTION_ROW],
        eveTypes: ['StructureDestroyed'],
      },
      { characterId: 2, accessToken: 'token-2', projectionRows: [], eveTypes: [] },
    ],
  };

  beforeEach(() => {
    verifyMock.mockReset();
  });

  it('writes every character whose access token verifies', async () => {
    verifyMock.mockImplementation(async (token) => ({
      characterId: token === 'token-1' ? 1 : 2,
      ownerHash: 'hash',
      name: 'Pilot',
      scopes: [],
      clientId: 'c',
    }));

    const result = await buildDeviceRegistration(input, opts);

    expect(result.registration).toEqual({ fcmToken: 'fcm-token', characterIds: [1, 2] });
    expect(result.rejected).toEqual([]);
  });

  it('carries each verified character’s projection rows through, keyed by characterId', async () => {
    verifyMock.mockImplementation(async (token) => ({
      characterId: token === 'token-1' ? 1 : 2,
      ownerHash: 'hash',
      name: 'Pilot',
      scopes: [],
      clientId: 'c',
    }));

    const result = await buildDeviceRegistration(input, opts);

    expect(result.projections).toEqual([
      { characterId: 1, rows: [PROJECTION_ROW] },
      { characterId: 2, rows: [] },
    ]);
  });

  it('keys each verified character’s eveTypes by characterId, omitting rejected ones', async () => {
    verifyMock.mockImplementation(async (token) => {
      if (token === 'token-2') throw new Error('expired');
      return { characterId: 1, ownerHash: 'hash', name: 'Pilot', scopes: [], clientId: 'c' };
    });

    const result = await buildDeviceRegistration(input, opts);

    expect(result.eveTypesByCharacter).toEqual({ 1: ['StructureDestroyed'] });
  });

  it('keys each verified character’s server events and inputs, omitting rejected and absent ones', async () => {
    verifyMock.mockImplementation(async (token) => {
      if (token === 'token-2') throw new Error('expired');
      return {
        characterId: token === 'token-1' ? 1 : 3,
        ownerHash: 'hash',
        name: 'P',
        scopes: [],
        clientId: 'c',
      };
    });

    const result = await buildDeviceRegistration(
      {
        ...input,
        characters: [
          {
            ...input.characters[0],
            serverEvents: ['shipLost'],
            serverInputs: { incursionNearbyJumps: 1 },
          },
          { ...input.characters[1], serverEvents: ['shipLost'] },
          { characterId: 3, accessToken: 'token-3', projectionRows: [] },
        ],
      },
      opts
    );

    expect(result.serverEventsByCharacter).toEqual({ 1: ['shipLost'] });
    expect(result.serverInputsByCharacter).toEqual({ 1: { incursionNearbyJumps: 1 } });
  });

  it('drops a character whose access token fails verification, keeping the rest', async () => {
    verifyMock.mockImplementation(async (token) => {
      if (token === 'token-1') throw new Error('expired');
      return { characterId: 2, ownerHash: 'hash', name: 'Pilot', scopes: [], clientId: 'c' };
    });

    const result = await buildDeviceRegistration(input, opts);

    expect(result.registration).toEqual({ fcmToken: 'fcm-token', characterIds: [2] });
    expect(result.rejected).toEqual([1]);
    // The rejected character's projection rows must not be written under a
    // characterId its token did not verify to — same invariant as characterIds.
    expect(result.projections).toEqual([{ characterId: 2, rows: [] }]);
  });

  it('drops a character whose verified identity does not match the claimed characterId', async () => {
    // A caller claiming characterId 1 but presenting a token that verifies as
    // some other character must not be written under the claimed id.
    verifyMock.mockResolvedValue({
      characterId: 999,
      ownerHash: 'hash',
      name: 'Someone else',
      scopes: [],
      clientId: 'c',
    });

    const result = await buildDeviceRegistration(input, opts);

    expect(result.registration.characterIds).toEqual([]);
    expect(result.rejected).toEqual([1, 2]);
    expect(result.projections).toEqual([]);
  });

  it('never includes an access token or refresh token in what it logs', async () => {
    verifyMock.mockRejectedValue(new Error('bad token'));
    const logged: unknown[] = [];

    await buildDeviceRegistration(input, opts, (message, meta) => logged.push({ message, meta }));

    const serialized = JSON.stringify(logged);
    expect(serialized).not.toContain('token-1');
    expect(serialized).not.toContain('token-2');
  });
});

describe('nearby alert inputs and Travel Settings (issue #5122)', () => {
  const base = {
    deviceId: 'device-1',
    fcmToken: 'fcm-token',
    characters: [{ characterId: 1, accessToken: 'a', projectionRows: [] }],
  };
  const withInputs = (serverInputs: Record<string, unknown>) => ({
    ...base,
    characters: [{ ...base.characters[0], serverInputs }],
  });

  it('leaves routeRules absent for an older client', () => {
    expect('routeRules' in parseRegisterDeviceInput(base)).toBe(false);
  });

  it('parses each nearby N from serverInputs', () => {
    const input = parseRegisterDeviceInput(
      withInputs({ incursionNearbyJumps: 10, skyhookRaidableNearbyJumps: 3 })
    );
    expect(input.characters[0].serverInputs).toEqual({
      incursionNearbyJumps: 10,
      skyhookRaidableNearbyJumps: 3,
    });
  });

  it.each([
    ['a fraction', 2.5],
    ['a negative', -1],
    ['a huge value', 1000],
    ['a string', '5'],
  ])('drops a nearby N that is %s, keeping the upload', (_, value) => {
    const input = parseRegisterDeviceInput(withInputs({ incursionNearbyJumps: value }));
    expect(input.characters[0].serverInputs).toEqual({});
  });

  it('parses routeRules, sorting and de-duplicating the Avoided Systems', () => {
    const input = parseRegisterDeviceInput({
      ...base,
      routeRules: { preference: 'shortest', securityPenalty: 40, avoid: [3, 1, 3] },
    });
    expect(input.routeRules).toEqual({
      preference: 'shortest',
      securityPenalty: 40,
      avoid: [1, 3],
    });
  });

  it.each([
    ['an unknown preference', { preference: 'fastest', securityPenalty: 50, avoid: [] }],
    ['a penalty out of range', { preference: 'shortest', securityPenalty: 101, avoid: [] }],
    ['a non-id in avoid', { preference: 'shortest', securityPenalty: 50, avoid: ['x'] }],
    [
      'too many avoided systems',
      {
        preference: 'shortest',
        securityPenalty: 50,
        avoid: Array.from({ length: 10_001 }, (_, i) => i + 1),
      },
    ],
  ])('drops routeRules with %s, keeping the upload', (_, routeRules) => {
    expect(parseRegisterDeviceInput({ ...base, routeRules }).routeRules).toBeUndefined();
  });
});
