import { describe, expect, it } from 'vitest';
import { SAFETY_RECONCILE_INTERVAL_MS, canSkipPass } from './syncMarker';

describe('canSkipPass', () => {
  const seen = { version: 4, fullAt: 1_000 };

  it('skips when the marker is unchanged inside the safety interval', () => {
    expect(canSkipPass(seen, 4, 1_000 + SAFETY_RECONCILE_INTERVAL_MS - 1)).toBe(true);
  });

  it('runs the pass once the marker moved', () => {
    expect(canSkipPass(seen, 5, 2_000)).toBe(false);
  });

  it('runs the pass when the remote marker is missing', () => {
    expect(canSkipPass(seen, null, 2_000)).toBe(false);
  });

  it('runs the pass when this device saw no marker yet', () => {
    expect(canSkipPass(undefined, 4, 2_000)).toBe(false);
  });

  it('runs the safety reconcile once the interval has passed', () => {
    expect(canSkipPass(seen, 4, 1_000 + SAFETY_RECONCILE_INTERVAL_MS)).toBe(false);
  });
});
