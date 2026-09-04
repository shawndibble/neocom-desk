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

  it('accepts projection rows on a character entry', () => {
    const input = parseRegisterDeviceInput({
      deviceId: 'device-1',
      fcmToken: 'fcm-token',
      characters: [{ characterId: 1, accessToken: 'a', projectionRows: [PROJECTION_ROW] }],
    });
    expect(input.characters[0].projectionRows).toEqual([PROJECTION_ROW]);
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
      { characterId: 1, accessToken: 'token-1', projectionRows: [PROJECTION_ROW] },
      { characterId: 2, accessToken: 'token-2', projectionRows: [] },
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
    }));

    const result = await buildDeviceRegistration(input, opts);

    expect(result.projections).toEqual([
      { characterId: 1, rows: [PROJECTION_ROW] },
      { characterId: 2, rows: [] },
    ]);
  });

  it('drops a character whose access token fails verification, keeping the rest', async () => {
    verifyMock.mockImplementation(async (token) => {
      if (token === 'token-1') throw new Error('expired');
      return { characterId: 2, ownerHash: 'hash', name: 'Pilot' };
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
    verifyMock.mockResolvedValue({ characterId: 999, ownerHash: 'hash', name: 'Someone else' });

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
