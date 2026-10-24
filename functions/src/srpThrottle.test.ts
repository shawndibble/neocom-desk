import { describe, expect, it } from 'vitest';
import { FETCH_LIMIT, FETCH_WINDOW_MS, nextThrottle } from './srpThrottle.js';

describe('nextThrottle', () => {
  it('opens a window on the first call', () => {
    expect(nextThrottle(undefined, 1000)).toEqual({
      allowed: true,
      state: { windowStart: 1000, count: 1 },
    });
  });

  it('counts calls inside the window up to the limit, then refuses without counting', () => {
    let state = nextThrottle(undefined, 0).state;
    for (let i = 1; i < FETCH_LIMIT; i++) {
      const step = nextThrottle(state, i);
      expect(step.allowed).toBe(true);
      state = step.state;
    }
    expect(state.count).toBe(FETCH_LIMIT);
    const refused = nextThrottle(state, FETCH_WINDOW_MS - 1);
    expect(refused.allowed).toBe(false);
    expect(refused.state).toEqual(state);
  });

  it('starts a fresh window once the old one has run out', () => {
    const full = { windowStart: 0, count: FETCH_LIMIT };
    expect(nextThrottle(full, FETCH_WINDOW_MS)).toEqual({
      allowed: true,
      state: { windowStart: FETCH_WINDOW_MS, count: 1 },
    });
  });
});
