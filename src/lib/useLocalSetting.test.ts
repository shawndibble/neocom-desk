import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/db';
import { createLocalSetting } from './useLocalSetting';

// Stores are memoized by key for the life of the module, so every test that
// wants a fresh (unhydrated) store must ask for a key nobody used before.
let keySeq = 0;
const freshKey = () => `test.setting.${++keySeq}`;

beforeEach(async () => {
  await db.settings.clear();
});

describe('createLocalSetting', () => {
  it('starts at the default and unhydrated, before Dexie is read', () => {
    const useSetting = createLocalSetting({ key: freshKey(), defaultValue: 'compact' });
    expect(useSetting.getState().value).toBe('compact');
    expect(useSetting.getState().hydrated).toBe(false);
  });

  it('flips hydrated false -> true and reads the stored value back', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: 'roomy' });
    const useSetting = createLocalSetting({ key, defaultValue: 'compact' });

    expect(useSetting.getState().hydrated).toBe(false);
    await useSetting.getState().hydrate();
    expect(useSetting.getState().hydrated).toBe(true);
    expect(useSetting.getState().value).toBe('roomy');
  });

  it('hydrates to the default when nothing is stored', async () => {
    const useSetting = createLocalSetting({ key: freshKey(), defaultValue: 1 });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe(1);
    expect(useSetting.getState().hydrated).toBe(true);
  });

  it('falls back to the default when the stored value is the wrong type', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: { corrupt: true } });
    const useSetting = createLocalSetting({ key, defaultValue: 1 });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe(1);
  });

  it('falls back to the default when parse rejects the stored value', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: 9 });
    const useSetting = createLocalSetting({
      key,
      defaultValue: 1,
      parse: (raw) => (raw === 1 || raw === 2 ? raw : null),
    });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toBe(1);
  });

  it('lets parse coerce a structured value the shallow guard would reject', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: ['a', 'b'] });
    const useSetting = createLocalSetting<string[]>({
      key,
      defaultValue: [],
      parse: (raw) => (Array.isArray(raw) ? (raw as string[]) : null),
    });
    await useSetting.getState().hydrate();
    expect(useSetting.getState().value).toEqual(['a', 'b']);
  });

  it('setValue persists to Dexie and updates state', async () => {
    const key = freshKey();
    const useSetting = createLocalSetting({ key, defaultValue: 1 });
    await useSetting.getState().setValue(2);
    expect(useSetting.getState().value).toBe(2);
    expect(useSetting.getState().hydrated).toBe(true);
    expect((await db.settings.get(key))?.value).toBe(2);
  });

  it('fires onApply on hydrate and on set, with the resolved value', async () => {
    const key = freshKey();
    await db.settings.put({ key, value: 1.25 });
    const onApply = vi.fn();
    const useSetting = createLocalSetting({ key, defaultValue: 1, onApply });

    await useSetting.getState().hydrate();
    expect(onApply).toHaveBeenLastCalledWith(1.25);

    await useSetting.getState().setValue(1.5);
    expect(onApply).toHaveBeenLastCalledWith(1.5);
    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('fires onApply with the default when hydration finds nothing usable', async () => {
    const onApply = vi.fn();
    const useSetting = createLocalSetting({ key: freshKey(), defaultValue: 1, onApply });
    await useSetting.getState().hydrate();
    expect(onApply).toHaveBeenCalledWith(1);
  });

  it('returns the same store for the same key, so writes propagate between consumers', async () => {
    const key = freshKey();
    const a = createLocalSetting({ key, defaultValue: 1 });
    const b = createLocalSetting({ key, defaultValue: 1 });
    expect(b).toBe(a);
    await a.getState().setValue(7);
    expect(b.getState().value).toBe(7);
  });

  it('rejects a sync.-prefixed key, which belongs to setSyncedSetting', () => {
    expect(() => createLocalSetting({ key: 'sync.density', defaultValue: 1 })).toThrow(/sync\./);
    // 'sync.__' is planSync's internal bookkeeping — also not ours to write.
    expect(() => createLocalSetting({ key: 'sync.__settingsMeta', defaultValue: 1 })).toThrow(
      /sync\./
    );
  });
});
