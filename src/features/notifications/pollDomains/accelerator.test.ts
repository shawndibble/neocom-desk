import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { HOUR_MS } from '@/lib/age';
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  useNotificationPreferences,
  withCharacterEventThreshold,
} from '../preferences';
import { acceleratorDomain } from './accelerator';

const CHARACTER = 11;

async function seed(characterId: number, expiresAt: number, bonus = 10) {
  await db.characterAccelerators.put({
    id: String(characterId),
    characterId,
    bonus,
    expiresAt,
    updatedAt: 1,
  });
}

beforeEach(async () => {
  await db.characterAccelerators.clear();
  await db.settings.clear();
  useNotificationPreferences.setState({ value: DEFAULT_NOTIFICATION_PREFERENCES, hydrated: true });
});

describe('acceleratorDomain.load', () => {
  it('reads nothing for a Character with no typed-in accelerator', async () => {
    expect(await acceleratorDomain.load(CHARACTER)).toEqual([]);
  });

  it('reads nothing for an accelerator that has already run out', async () => {
    await seed(CHARACTER, Date.now() - 1000);
    expect(await acceleratorDomain.load(CHARACTER)).toEqual([]);
  });

  it("reads only this Character's running accelerator, with the default one-hour lead", async () => {
    const expiresAt = Date.now() + 5 * HOUR_MS;
    await seed(CHARACTER, expiresAt, 12);
    await seed(22, Date.now() + HOUR_MS);
    expect(await acceleratorDomain.load(CHARACTER)).toEqual([
      { expiresAtMs: expiresAt, bonus: 12, leadMs: HOUR_MS },
    ]);
  });

  it("bakes in the Character's configured lead time", async () => {
    await seed(CHARACTER, Date.now() + 5 * HOUR_MS);
    useNotificationPreferences.setState({
      value: withCharacterEventThreshold(
        DEFAULT_NOTIFICATION_PREFERENCES,
        CHARACTER,
        'acceleratorExpiringLeadHours',
        6
      ),
      hydrated: true,
    });
    const [entry] = ((await acceleratorDomain.load(CHARACTER)) ?? []) as { leadMs: number }[];
    expect(entry.leadMs).toBe(6 * HOUR_MS);
  });
});
