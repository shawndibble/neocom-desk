import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_INCLUDE_BLUEPRINT_COST,
  INCLUDE_BLUEPRINT_COST_SETTING_KEY,
  useIncludeBlueprintCost,
} from './includeBlueprintCost';

beforeEach(async () => {
  await db.settings.clear();
  useIncludeBlueprintCost.setState({ value: DEFAULT_INCLUDE_BLUEPRINT_COST, hydrated: false });
});

async function hydrated(): Promise<boolean> {
  await useIncludeBlueprintCost.getState().hydrate();
  return useIncludeBlueprintCost.getState().value;
}

describe('useIncludeBlueprintCost', () => {
  it('defaults to true — blueprint cost counts toward profit until a pilot opts out', async () => {
    expect(await hydrated()).toBe(true);
  });

  it('round-trips a stored false', async () => {
    await db.settings.put({ key: INCLUDE_BLUEPRINT_COST_SETTING_KEY, value: false });
    expect(await hydrated()).toBe(false);
  });

  it.each([
    ['a number', 1],
    ['a string', 'true'],
    ['null', null],
  ])('falls back to the default for %s', async (_label, stored) => {
    await db.settings.put({ key: INCLUDE_BLUEPRINT_COST_SETTING_KEY, value: stored });
    expect(await hydrated()).toBe(DEFAULT_INCLUDE_BLUEPRINT_COST);
  });

  it('persists a chosen value', async () => {
    await useIncludeBlueprintCost.getState().setValue(false);
    expect((await db.settings.get(INCLUDE_BLUEPRINT_COST_SETTING_KEY))?.value).toBe(false);
  });
});
