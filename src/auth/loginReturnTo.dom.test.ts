import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLoginReturnTo, takeLoginReturnTo, usableLoginReturnTo } from './loginReturnTo';

beforeEach(() => {
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loginReturnTo', () => {
  it('returns null when nothing was stashed', () => {
    expect(takeLoginReturnTo()).toBeNull();
  });

  it('round-trips a stashed path', () => {
    setLoginReturnTo('/ships/fittings?f=abc123');
    expect(takeLoginReturnTo()).toBe('/ships/fittings?f=abc123');
  });

  it('consumes the stash on read, so a second read gets nothing', () => {
    setLoginReturnTo('/ships/fittings?f=abc123');
    takeLoginReturnTo();
    expect(takeLoginReturnTo()).toBeNull();
  });

  it('drops a stash older than the TTL, so an unrelated later login is not hijacked', () => {
    vi.useFakeTimers();
    setLoginReturnTo('/ships/fittings?f=abc123');
    vi.advanceTimersByTime(16 * 60_000);
    expect(takeLoginReturnTo()).toBeNull();
  });

  it('outlives a visitor lingering on the EVE login page, as long as the PKCE stash does', () => {
    vi.useFakeTimers();
    setLoginReturnTo('/settings');
    vi.advanceTimersByTime(14 * 60_000);
    expect(takeLoginReturnTo()).toBe('/settings');
  });
});

describe('usableLoginReturnTo', () => {
  it('keeps path, query and hash', () => {
    expect(usableLoginReturnTo('/market/browser?info=123#x')).toBe('/market/browser?info=123#x');
  });

  it.each([
    undefined,
    null,
    42,
    '',
    'market',
    'https://evil.com',
    '//evil.com',
    '/login',
    '/login?x=1',
    '/callback?code=abc',
    '/callback',
  ])('refuses %j', (value) => {
    expect(usableLoginReturnTo(value)).toBeNull();
  });

  it('keeps a path that only starts like a gate route', () => {
    expect(usableLoginReturnTo('/loginfo')).toBe('/loginfo');
  });
});
