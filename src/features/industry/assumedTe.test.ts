import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { ASSUMED_TE_SETTING_KEY, DEFAULT_ASSUMED_TE, useAssumedTe } from './assumedTe';

beforeEach(async () => {
  await db.settings.clear();
  useAssumedTe.setState({ value: DEFAULT_ASSUMED_TE, hydrated: false });
});

async function hydrated(): Promise<number> {
  await useAssumedTe.getState().hydrate();
  return useAssumedTe.getState().value;
}

describe('useAssumedTe', () => {
  it('defaults to 0 — existing plans keep the numbers they had', async () => {
    expect(await hydrated()).toBe(0);
  });

  it('round-trips a stored value', async () => {
    await db.settings.put({ key: ASSUMED_TE_SETTING_KEY, value: 4 });
    expect(await hydrated()).toBe(4);
  });

  it('accepts both ends of the range the engine allows — 20, not ME\u2019s 10', async () => {
    for (const te of [0, 10, 20]) {
      await db.settings.put({ key: ASSUMED_TE_SETTING_KEY, value: te });
      useAssumedTe.setState({ hydrated: false });
      expect(await hydrated()).toBe(te);
    }
  });

  it.each([
    ['above the range', 21],
    ['below the range', -1],
    ['fractional', 5.5],
    ['a string', '5'],
    ['null', null],
  ])('falls back to the default for %s', async (_label, stored) => {
    // Out-of-range reaches the engine's own range check and throws, so a
    // damaged row must not be clamped into a value the pilot never picked.
    await db.settings.put({ key: ASSUMED_TE_SETTING_KEY, value: stored });
    expect(await hydrated()).toBe(DEFAULT_ASSUMED_TE);
  });

  it('persists a chosen value', async () => {
    await useAssumedTe.getState().setValue(14);
    expect((await db.settings.get(ASSUMED_TE_SETTING_KEY))?.value).toBe(14);
  });

  it('has no legacy device-local key to adopt — the preference is new', async () => {
    // Unlike assumed ME, this never had a pre-sync life, so a row under the
    // unprefixed name is somebody else's and must not be picked up.
    await db.settings.put({ key: 'industryAssumedTe', value: 8 });
    expect(await hydrated()).toBe(DEFAULT_ASSUMED_TE);
  });
});
