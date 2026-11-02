import { describe, expect, it } from 'vitest';
import { parseAddOwnFeederInput, parseRemoveOwnFeederInput } from './corpTaxBookOwnFeeder.js';

describe('add own feeder parser', () => {
  const base = {
    corporationId: 5,
    accessToken: 'roles',
    grantAccessToken: 'mine',
    grantRefreshToken: 'rt',
    feederCorporationId: 6,
  };

  it('takes both token pairs and the expected corporation, with the start day optional', () => {
    expect(parseAddOwnFeederInput(base)).toEqual(base);
    expect(parseAddOwnFeederInput({ ...base, coverageFrom: '2026-10-05' }).coverageFrom).toBe(
      '2026-10-05'
    );
    expect(parseAddOwnFeederInput({ ...base, coverageFrom: null })).toEqual(base);
  });

  it.each(['accessToken', 'grantAccessToken', 'grantRefreshToken', 'feederCorporationId'])(
    'needs %s',
    (key) => {
      expect(() => parseAddOwnFeederInput({ ...base, [key]: undefined })).toThrow();
    }
  );

  it.each(['yesterday', '2026-13-40', 20261005])('rejects a start day of %s', (day) => {
    expect(() => parseAddOwnFeederInput({ ...base, coverageFrom: day })).toThrow();
  });

  it('rejects a corporation id that is not a positive integer', () => {
    expect(() => parseAddOwnFeederInput({ ...base, feederCorporationId: 0 })).toThrow();
    expect(() => parseAddOwnFeederInput({ ...base, corporationId: '5' })).toThrow();
  });
});

describe('remove own feeder parser', () => {
  it('needs the book, the moon owner and the editor token', () => {
    const ok = { corporationId: 5, accessToken: 't', feederCorporationId: 6 };
    expect(parseRemoveOwnFeederInput(ok)).toEqual(ok);
    expect(() => parseRemoveOwnFeederInput({ ...ok, accessToken: undefined })).toThrow();
    expect(() => parseRemoveOwnFeederInput({ ...ok, feederCorporationId: undefined })).toThrow();
  });
});
