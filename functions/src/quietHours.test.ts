import { describe, expect, it } from 'vitest';
import { isAttackType, isQuiet, parseQuietHours, suppressPush } from './quietHours.js';

const at = (iso: string) => Date.parse(iso);
const win = (start: string, end: string, timeZone = 'UTC') => ({ start, end, timeZone });

describe('isQuiet', () => {
  it('same-day window: inside, edges, outside', () => {
    const w = win('13:00', '15:00');
    expect(isQuiet(at('2026-03-10T14:00:00Z'), w)).toBe(true);
    expect(isQuiet(at('2026-03-10T13:00:00Z'), w)).toBe(true);
    expect(isQuiet(at('2026-03-10T15:00:00Z'), w)).toBe(false);
    expect(isQuiet(at('2026-03-10T12:59:00Z'), w)).toBe(false);
  });

  it('window crossing midnight', () => {
    const w = win('22:00', '07:00');
    expect(isQuiet(at('2026-03-10T23:30:00Z'), w)).toBe(true);
    expect(isQuiet(at('2026-03-10T03:00:00Z'), w)).toBe(true);
    expect(isQuiet(at('2026-03-10T07:00:00Z'), w)).toBe(false);
    expect(isQuiet(at('2026-03-10T12:00:00Z'), w)).toBe(false);
  });

  it('equal start and end is off', () => {
    expect(isQuiet(at('2026-03-10T12:00:00Z'), win('12:00', '12:00'))).toBe(false);
  });

  it('reads the clock in the device zone', () => {
    const w = win('22:00', '07:00', 'America/New_York');
    // 03:00Z in March (EDT, UTC-4) is 23:00 local: quiet.
    expect(isQuiet(at('2026-03-10T03:00:00Z'), w)).toBe(true);
    // 12:00Z is 08:00 local: awake.
    expect(isQuiet(at('2026-03-10T12:00:00Z'), w)).toBe(false);
  });

  it('follows DST: the same UTC hour is a different local hour either side of the change', () => {
    const w = win('02:30', '04:00', 'America/New_York');
    // 2026-03-08 spring forward: 06:45Z is 01:45 EST, 07:45Z is 03:45 EDT.
    expect(isQuiet(at('2026-03-08T06:45:00Z'), w)).toBe(false);
    expect(isQuiet(at('2026-03-08T07:45:00Z'), w)).toBe(true);
    // 2026-11-01 fall back: 06:45Z is 01:45 EST, 07:45Z is 02:45 EST... check 02:30 start.
    expect(isQuiet(at('2026-11-01T07:45:00Z'), w)).toBe(true);
    expect(isQuiet(at('2026-11-01T05:45:00Z'), w)).toBe(false);
  });

  it('invalid zone is not quiet and never throws', () => {
    expect(isQuiet(at('2026-03-10T23:00:00Z'), win('22:00', '07:00', 'Mars/Olympus'))).toBe(false);
  });

  it('malformed times are not quiet', () => {
    expect(isQuiet(at('2026-03-10T23:00:00Z'), win('25:00', '07:00'))).toBe(false);
    expect(isQuiet(at('2026-03-10T23:00:00Z'), win('22:00', 'soon'))).toBe(false);
  });
});

describe('parseQuietHours', () => {
  const ok = { start: '22:00', end: '07:00', timeZone: 'Europe/Berlin', allowAttacks: true };

  it('accepts a valid window', () => {
    expect(parseQuietHours(ok)).toEqual(ok);
  });

  it('null clears', () => {
    expect(parseQuietHours(null)).toBeNull();
  });

  it('absent stays absent', () => {
    expect(parseQuietHours(undefined)).toBeUndefined();
  });

  it('defaults allowAttacks to false', () => {
    expect(parseQuietHours({ ...ok, allowAttacks: undefined })?.allowAttacks).toBe(false);
  });

  it.each([
    ['bad start', { ...ok, start: '24:00' }],
    ['bad end', { ...ok, end: '7:00' }],
    ['bad zone', { ...ok, timeZone: 'Nowhere/Land' }],
    ['non-string zone', { ...ok, timeZone: 5 }],
    ['non-boolean allowAttacks', { ...ok, allowAttacks: 'yes' }],
    ['not an object', 'quiet'],
  ])('rejects %s', (_name, raw) => {
    expect(() => parseQuietHours(raw)).toThrow(/quietHours/);
  });
});

describe('suppressPush', () => {
  const quiet = { start: '22:00', end: '07:00', timeZone: 'UTC', allowAttacks: false };
  const night = at('2026-03-10T23:00:00Z');
  const day = at('2026-03-10T12:00:00Z');

  it('no window: never suppressed', () => {
    expect(suppressPush(night, undefined, 'StructureUnderAttack')).toBe(false);
  });

  it('inside the window: suppressed', () => {
    expect(suppressPush(night, quiet, 'SkillFinished')).toBe(true);
    expect(suppressPush(night, quiet, undefined)).toBe(true);
  });

  it('outside the window: sent', () => {
    expect(suppressPush(day, quiet, 'SkillFinished')).toBe(false);
  });

  it('attacks pass only when ticked', () => {
    expect(suppressPush(night, quiet, 'StructureUnderAttack')).toBe(true);
    expect(suppressPush(night, { ...quiet, allowAttacks: true }, 'StructureUnderAttack')).toBe(
      false
    );
    expect(suppressPush(night, { ...quiet, allowAttacks: true }, 'SkillFinished')).toBe(true);
  });
});

describe('isAttackType', () => {
  it('matches the attack and loss kinds', () => {
    expect(isAttackType('StructureDestroyed')).toBe(true);
    expect(isAttackType('StructureFuelAlert')).toBe(false);
    expect(isAttackType(undefined)).toBe(false);
  });
});
