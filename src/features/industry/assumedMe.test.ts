import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  ASSUMED_ME_SETTING_KEY,
  DEFAULT_ASSUMED_ME,
  LEGACY_ASSUMED_ME_SETTING_KEY,
  useAssumedMe,
} from './assumedMe';

beforeEach(async () => {
  await db.settings.clear();
  useAssumedMe.setState({ value: DEFAULT_ASSUMED_ME, hydrated: false });
});

async function hydrated(): Promise<number> {
  await useAssumedMe.getState().hydrate();
  return useAssumedMe.getState().value;
}

describe('useAssumedMe', () => {
  it('defaults to 0 — existing plans keep the numbers they had', async () => {
    expect(await hydrated()).toBe(0);
  });

  it('round-trips a stored value', async () => {
    await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: 10 });
    expect(await hydrated()).toBe(10);
  });

  it('accepts both ends of the range the engine allows', async () => {
    for (const me of [0, 10]) {
      await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: me });
      useAssumedMe.setState({ hydrated: false });
      expect(await hydrated()).toBe(me);
    }
  });

  it.each([
    ['above the range', 11],
    ['below the range', -1],
    ['fractional', 5.5],
    ['a string', '5'],
    ['null', null],
  ])('falls back to the default for %s', async (_label, stored) => {
    // Out-of-range reaches the engine's own range check and throws, so a
    // damaged row must not be clamped into a value the pilot never picked.
    await db.settings.put({ key: ASSUMED_ME_SETTING_KEY, value: stored });
    expect(await hydrated()).toBe(DEFAULT_ASSUMED_ME);
  });

  it('persists a chosen value', async () => {
    await useAssumedMe.getState().setValue(7);
    expect((await db.settings.get(ASSUMED_ME_SETTING_KEY))?.value).toBe(7);
  });

  it('adopts the value a pilot set before the preference synced', async () => {
    await db.settings.put({ key: LEGACY_ASSUMED_ME_SETTING_KEY, value: 8 });
    expect(await hydrated()).toBe(8);
    expect((await db.settings.get(ASSUMED_ME_SETTING_KEY))?.value).toBe(8);
  });

  it('validates an adopted value like any other — a damaged legacy row is not trusted', async () => {
    await db.settings.put({ key: LEGACY_ASSUMED_ME_SETTING_KEY, value: 11 });
    expect(await hydrated()).toBe(DEFAULT_ASSUMED_ME);
  });
});
