import { describe, expect, it } from 'vitest';
import {
  ACCESS_TTL_MS,
  ROLE_CACHE_MS,
  decideRoles,
  defaultSettings,
  isCacheFresh,
  parseEditAction,
  parseSettingsPatch,
  parseStatement,
  parseSyncInput,
  parseToken,
  parseTurnOnInput,
  satisfies,
} from './corpTaxBook.js';

describe('decideRoles (D8)', () => {
  it.each([
    [['Director'], false, { canView: true, canEdit: true, isDirector: true }],
    [['Accountant'], false, { canView: true, canEdit: true, isDirector: false }],
    [['Junior_Accountant'], false, { canView: true, canEdit: false, isDirector: false }],
    [['Station_Manager'], false, { canView: false, canEdit: false, isDirector: false }],
    [[], false, { canView: false, canEdit: false, isDirector: false }],
    [[], true, { canView: true, canEdit: true, isDirector: true }],
  ])('%j (ceo %s)', (roles, ceo, expected) => {
    expect(decideRoles(roles, ceo)).toMatchObject(expected);
  });

  it('lets only a CEO satisfy "ceo", and a Director satisfy "director"', () => {
    expect(satisfies(decideRoles(['Director'], false), 'ceo')).toBe(false);
    expect(satisfies(decideRoles([], true), 'ceo')).toBe(true);
    expect(satisfies(decideRoles(['Accountant'], false), 'director')).toBe(false);
  });

  it('knows Station_Manager from the role, a Director or the CEO', () => {
    expect(decideRoles(['Station_Manager', 'Accountant'], false).isStationManager).toBe(true);
    expect(decideRoles(['Accountant'], false).isStationManager).toBe(false);
    expect(decideRoles(['Director'], false).isStationManager).toBe(true);
  });
});

describe('cache windows', () => {
  it('trusts a role check for at most 10 minutes and access for 24 hours', () => {
    expect(ROLE_CACHE_MS).toBe(600_000);
    expect(ACCESS_TTL_MS).toBe(86_400_000);
    expect(isCacheFresh(1000, 1000 + ROLE_CACHE_MS)).toBe(true);
    expect(isCacheFresh(1000, 1001 + ROLE_CACHE_MS)).toBe(false);
    expect(isCacheFresh(10_000_000, 1000)).toBe(false);
  });
});

describe('defaultSettings (#4059 hand-off)', () => {
  it('sets the book defaults and a start-date rate dated at the start', () => {
    expect(defaultSettings('2026-10-01', 10)).toMatchObject({
      hubId: 'jita',
      oreForm: 'compressed',
      graceHours: 6,
      minimumStatement: 5_000_000,
      overdueDays: 14,
      divisions: [1],
      rates: [{ scope: 'corp', pct: 10, effectiveFrom: '2026-10-01' }],
    });
  });
});

describe('parsers', () => {
  it('rejects bad turn-on input', () => {
    const base = { corporationId: 9, startDate: '2026-10-01', startRatePct: 5 };
    expect(parseTurnOnInput(base).startRatePct).toBe(5);
    expect(() => parseTurnOnInput({ ...base, startRatePct: 101 })).toThrow();
    expect(() => parseTurnOnInput({ ...base, startDate: '2026-13-40' })).toThrow();
    expect(() => parseTurnOnInput({ ...base, corporationId: '9' })).toThrow();
  });

  it('refuses a path-escaping id and an unknown action', () => {
    expect(() => parseEditAction({ action: 'dismissAll' })).toThrow();
    expect(() =>
      parseEditAction({ action: 'reverseDismissal', dismissalId: '../x', reason: 'r' })
    ).toThrow();
    expect(() =>
      parseEditAction({ action: 'dismiss', scope: 'record', targetId: 'a', reason: '' })
    ).toThrow();
  });

  it('wants a main inside the group', () => {
    expect(() =>
      parseEditAction({
        action: 'setMiner',
        minerId: 'm',
        characterIds: [1, 2],
        mainCharacterId: 3,
      })
    ).toThrow();
  });

  it('bounds settings', () => {
    expect(() => parseSettingsPatch({})).toThrow();
    expect(() => parseSettingsPatch({ hubId: 'nowhere' })).toThrow();
    expect(() => parseSettingsPatch({ structureExpiryHours: { '1': 97 } })).toThrow();
    expect(
      parseSettingsPatch({ structureExpiryHours: { '1': 96 }, divisions: [2, 1, 2] })
    ).toMatchObject({
      divisions: [1, 2],
    });
  });

  it('refuses observer rows from the future', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const row = {
      structureId: 1,
      characterId: 2,
      recordedCorporationId: 3,
      typeId: 4,
      date: '2026-10-19',
      quantity: 1,
      cachedAt: '2026-10-18T11:00:00Z',
    };
    expect(() => parseSyncInput({ corporationId: 9, observed: [row] }, now)).toThrow();
    expect(
      parseSyncInput({ corporationId: 9, observed: [{ ...row, date: '2026-10-18' }] }, now).observed
    ).toHaveLength(1);
  });

  it('accepts only a 43-character url-safe token', () => {
    expect(parseToken({ token: 'a'.repeat(43) })).toHaveLength(43);
    expect(() => parseToken({ token: 'short' })).toThrow();
  });

  it('keeps the Statement fields the book relies on', () => {
    expect(() => parseStatement({ id: 's' })).toThrow();
  });
});
