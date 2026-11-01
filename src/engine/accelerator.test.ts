import { describe, expect, it } from 'vitest';
import { isAcceleratorLive, resolveAccelerator } from './accelerator';

const NOW = 1_000_000;

describe('resolveAccelerator', () => {
  it('a typed-in accelerator that has not run out wins over a detected one', () => {
    expect(resolveAccelerator({ bonus: 12, expiresAt: NOW + 5 }, 3, NOW)).toEqual({
      kind: 'manual',
      bonus: 12,
      expiresAt: NOW + 5,
    });
  });

  it('an expired typed-in accelerator is gone: detection takes over again', () => {
    expect(resolveAccelerator({ bonus: 12, expiresAt: NOW }, 3, NOW)).toEqual({
      kind: 'detected',
      bonus: 3,
    });
    expect(resolveAccelerator({ bonus: 12, expiresAt: NOW - 1 }, null, NOW)).toEqual({
      kind: 'none',
    });
  });

  it('with nothing typed in, a detected bonus is a guess with no expiry', () => {
    expect(resolveAccelerator(null, 12, NOW)).toEqual({ kind: 'detected', bonus: 12 });
    expect(resolveAccelerator(undefined, 0, NOW)).toEqual({ kind: 'none' });
    expect(resolveAccelerator(null, null, NOW)).toEqual({ kind: 'none' });
  });
});

describe('isAcceleratorLive', () => {
  it('is live strictly before its expiry', () => {
    expect(isAcceleratorLive({ expiresAt: NOW + 1 }, NOW)).toBe(true);
    expect(isAcceleratorLive({ expiresAt: NOW }, NOW)).toBe(false);
    expect(isAcceleratorLive(null, NOW)).toBe(false);
  });
});
