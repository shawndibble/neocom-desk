// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocal, removeLocal, writeLocal } from './safeLocalStorage';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('safeLocalStorage', () => {
  it('round-trips a value and removes it', () => {
    writeLocal('k', 'v');
    expect(readLocal('k')).toBe('v');
    removeLocal('k');
    expect(readLocal('k')).toBeNull();
  });

  it('reads null when storage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readLocal('k')).toBeNull();
  });

  it('swallows write and remove failures', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => writeLocal('k', 'v')).not.toThrow();
    expect(() => removeLocal('k')).not.toThrow();
  });
});
