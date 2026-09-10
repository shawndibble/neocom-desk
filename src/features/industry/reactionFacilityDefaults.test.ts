import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import { EMPTY_RIG_FIT } from '@/engine/industry/types';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  REACTION_FACILITY_DEFAULTS_SETTING_KEY,
  normalizeReactionFacilityDefaults,
  useReactionFacilityDefaults,
  type ReactionFacilityDefaults,
} from './reactionFacilityDefaults';

beforeEach(async () => {
  await db.settings.clear();
  useReactionFacilityDefaults.setState({
    value: DEFAULT_REACTION_FACILITY_DEFAULTS,
    hydrated: false,
  });
});

async function hydrated(): Promise<ReactionFacilityDefaults> {
  await useReactionFacilityDefaults.getState().hydrate();
  return useReactionFacilityDefaults.getState().value;
}

describe('normalizeReactionFacilityDefaults', () => {
  it('keeps a refinery as-is', () => {
    const value: ReactionFacilityDefaults = {
      facility: 'tatara',
      rigFit: ['meT2', 'teT2', 'none'],
      facilityTaxPct: 3,
    };
    expect(normalizeReactionFacilityDefaults(value)).toEqual(value);
  });

  it('falls back to the default for a facility that cannot host a reaction', () => {
    expect(
      normalizeReactionFacilityDefaults({
        facility: 'raitaru',
        rigFit: ['meT2', 'teT2', 'none'],
        facilityTaxPct: 3,
      })
    ).toEqual(DEFAULT_REACTION_FACILITY_DEFAULTS);
  });
});

describe('useReactionFacilityDefaults', () => {
  it('defaults to an unfitted Athanor', async () => {
    expect(await hydrated()).toEqual(DEFAULT_REACTION_FACILITY_DEFAULTS);
  });

  it('round-trips a rigged Tatara with an owner-set tax', async () => {
    const value: ReactionFacilityDefaults = {
      facility: 'tatara',
      rigFit: ['meT2', 'teT2', 'none'],
      facilityTaxPct: 2.5,
    };
    await db.settings.put({ key: REACTION_FACILITY_DEFAULTS_SETTING_KEY, value });
    expect(await hydrated()).toEqual(value);
  });

  it.each([
    ['a manufacturing facility', { facility: 'raitaru', rigFit: EMPTY_RIG_FIT }],
    ['a facility this build does not know', { facility: 'keepstar', rigFit: EMPTY_RIG_FIT }],
    ['a bad rig kind', { facility: 'athanor', rigFit: ['bogus'], facilityTaxPct: null }],
    ['a negative tax', { facility: 'athanor', rigFit: EMPTY_RIG_FIT, facilityTaxPct: -1 }],
    ['not an object', 'athanor'],
    ['null', null],
  ])('falls back to the default for %s', async (_label, stored) => {
    await db.settings.put({ key: REACTION_FACILITY_DEFAULTS_SETTING_KEY, value: stored });
    expect(await hydrated()).toEqual(DEFAULT_REACTION_FACILITY_DEFAULTS);
  });

  it('treats an absent tax as "use the preset’s own"', async () => {
    await db.settings.put({
      key: REACTION_FACILITY_DEFAULTS_SETTING_KEY,
      value: { facility: 'tatara', rigFit: ['meT1', 'teT1', 'none'] },
    });
    expect(await hydrated()).toEqual({
      facility: 'tatara',
      rigFit: ['meT1', 'teT1', 'none'],
      facilityTaxPct: null,
    });
  });
});
