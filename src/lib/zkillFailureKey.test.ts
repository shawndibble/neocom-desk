import { describe, expect, it } from 'vitest';
import { zkillFailureKey } from './zkillFailureKey';

describe('zkillFailureKey', () => {
  it('names the offline and rate-limit messages', () => {
    expect(zkillFailureKey('offline', 'x.generic')).toBe('travel.zkillFailure.offline');
    expect(zkillFailureKey('rate-limited', 'x.generic')).toBe('travel.zkillFailure.rateLimited');
  });

  it("keeps the surface's own message for http, parse or an unknown cause", () => {
    expect(zkillFailureKey('http', 'x.generic')).toBe('x.generic');
    expect(zkillFailureKey('parse', 'x.generic')).toBe('x.generic');
    expect(zkillFailureKey(undefined, 'x.generic')).toBe('x.generic');
  });
});
