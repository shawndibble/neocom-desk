import { beforeEach, describe, expect, it } from 'vitest';
import { getDeviceId } from './deviceId';

beforeEach(() => {
  localStorage.clear();
});

describe('getDeviceId', () => {
  it('mints and persists an id on first call', () => {
    const id = getDeviceId();
    expect(id.length).toBeGreaterThan(0);
    expect(localStorage.getItem('neocom.deviceId')).toBe(id);
  });

  it('returns the same id on every subsequent call', () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(second).toBe(first);
  });

  it('reuses whatever id is already stored, even across a reload', () => {
    localStorage.setItem('neocom.deviceId', 'existing-id');
    expect(getDeviceId()).toBe('existing-id');
  });

  it('mints a fresh id if the stored value is empty', () => {
    localStorage.setItem('neocom.deviceId', '');
    const id = getDeviceId();
    expect(id.length).toBeGreaterThan(0);
  });

  it('produces ids that do not collide across many mints', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 50; i++) {
      localStorage.clear();
      ids.add(getDeviceId());
    }
    expect(ids.size).toBe(50);
  });
});

// crypto.randomUUID is not guaranteed in every test/browser environment this
// runs in (older WebViews) — this locks in the fallback path.
describe('getDeviceId without crypto.randomUUID', () => {
  it('still mints a usable id', () => {
    const original = globalThis.crypto.randomUUID;
    // @ts-expect-error -- deliberately simulating an environment without it
    delete globalThis.crypto.randomUUID;
    try {
      const id = getDeviceId();
      expect(id.length).toBeGreaterThan(0);
    } finally {
      globalThis.crypto.randomUUID = original;
    }
  });
});
