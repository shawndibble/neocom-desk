import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { adoptRefineryDefaultAsReactionLocation } from './adoptRefineryDefault';
import { DEFAULT_FACILITY_DEFAULTS, FACILITY_DEFAULTS_SETTING_KEY } from './facilityDefaults';
import { REACTION_FACILITY_DEFAULTS_SETTING_KEY } from './reactionFacilityDefaults';

const RIGGED_TATARA = { facility: 'tatara', rigFit: ['meT2', 'teT1', 'none'], facilityTaxPct: 2 };

beforeEach(async () => {
  await db.settings.clear();
});

describe('adoptRefineryDefaultAsReactionLocation', () => {
  it('moves a refinery to the Reaction Location default, where it is now read', async () => {
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: RIGGED_TATARA });

    await adoptRefineryDefaultAsReactionLocation();

    // The rig fit and tax survive the move — that record *was* the pilot's
    // answer to "where do my reactions run", just stored where nothing reads
    // it any more.
    expect(await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({
      value: RIGGED_TATARA,
    });
    expect(await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({
      value: DEFAULT_FACILITY_DEFAULTS,
    });
  });

  it('leaves an answer the pilot already gave alone', async () => {
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: RIGGED_TATARA });
    const athanor = { facility: 'athanor', rigFit: ['none', 'none', 'none'], facilityTaxPct: null };
    await db.settings.put({ key: REACTION_FACILITY_DEFAULTS_SETTING_KEY, value: athanor });

    await adoptRefineryDefaultAsReactionLocation();

    expect(await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({
      value: athanor,
    });
    // Nothing moved, so nothing is vacated either.
    expect(await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({
      value: RIGGED_TATARA,
    });
  });

  it('leaves a manufacturing facility where it is', async () => {
    const azbel = { facility: 'azbel', rigFit: ['meT1', 'none', 'none'], facilityTaxPct: 5 };
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: azbel });

    await adoptRefineryDefaultAsReactionLocation();

    expect(await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY)).toMatchObject({ value: azbel });
    expect(await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY)).toBeUndefined();
  });

  it('writes the adopted row unstamped, so a real edit elsewhere still wins', async () => {
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: RIGGED_TATARA });

    await adoptRefineryDefaultAsReactionLocation();

    // Same reasoning as `useSyncedSetting`'s legacyKey adoption: a value this
    // device may have set months ago must not outrank yesterday's real edit
    // on another device.
    expect(await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY)).not.toHaveProperty(
      'updatedAt'
    );
  });
});
