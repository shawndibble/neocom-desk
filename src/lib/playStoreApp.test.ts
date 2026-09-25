import { describe, expect, it } from 'vitest';
import { PLAY_STORE_PACKAGE, detectPlayStoreApp } from './playStoreApp';

function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

describe('detectPlayStoreApp', () => {
  it('is true when the referrer is the Play Store package', () => {
    expect(detectPlayStoreApp(`android-app://${PLAY_STORE_PACKAGE}`, store())).toBe(true);
  });

  it('accepts a referrer with a path after the package', () => {
    expect(detectPlayStoreApp(`android-app://${PLAY_STORE_PACKAGE}/https/x`, store())).toBe(true);
  });

  it('is false for a normal web referrer or none', () => {
    expect(detectPlayStoreApp('https://google.com/', store())).toBe(false);
    expect(detectPlayStoreApp('', store())).toBe(false);
  });

  it('ignores an android-app referrer for another package', () => {
    expect(detectPlayStoreApp('android-app://com.other.app', store())).toBe(false);
  });

  it('remembers a positive across later loads that lost the referrer', () => {
    const s = store();
    detectPlayStoreApp(`android-app://${PLAY_STORE_PACKAGE}`, s);
    expect(detectPlayStoreApp('', s)).toBe(true);
  });

  it('survives storage that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(detectPlayStoreApp(`android-app://${PLAY_STORE_PACKAGE}`, broken)).toBe(true);
    expect(detectPlayStoreApp('', broken)).toBe(false);
  });
});
