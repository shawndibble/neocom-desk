import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setLoginReturnTo, takeLoginReturnTo } from './loginReturnTo';

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
    setLoginReturnTo('/fittings?f=abc123');
    expect(takeLoginReturnTo()).toBe('/fittings?f=abc123');
  });

  it('consumes the stash on read, so a second read gets nothing', () => {
    setLoginReturnTo('/fittings?f=abc123');
    takeLoginReturnTo();
    expect(takeLoginReturnTo()).toBeNull();
  });

  it('drops a stash older than the TTL, so an unrelated later login is not hijacked', () => {
    vi.useFakeTimers();
    setLoginReturnTo('/fittings?f=abc123');
    vi.advanceTimersByTime(6 * 60_000);
    expect(takeLoginReturnTo()).toBeNull();
  });
});
