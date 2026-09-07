import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  DEFAULT_FACILITY_DEFAULTS,
  FACILITY_DEFAULTS_SETTING_KEY,
  normalizeFacilityDefaults,
  useFacilityDefaults,
  type FacilityDefaults,
} from './facilityDefaults';

beforeEach(async () => {
  await db.settings.clear();
  useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
});

async function hydrated(): Promise<FacilityDefaults> {
  await useFacilityDefaults.getState().hydrate();
  return useFacilityDefaults.getState().value;
}

describe('normalizeFacilityDefaults', () => {
  it('keeps rig and tax for a player structure', () => {
    const value: FacilityDefaults = { facility: 'azbel', rigLevel: 't2', facilityTaxPct: 3 };
    expect(normalizeFacilityDefaults(value)).toEqual(value);
  });

  it('strips rig and tax from an NPC station, which fits neither', () => {
    expect(
      normalizeFacilityDefaults({ facility: 'npcStation', rigLevel: 't2', facilityTaxPct: 3 })
    ).toEqual({ facility: 'npcStation', rigLevel: 'none', facilityTaxPct: null });
  });
});

describe('useFacilityDefaults', () => {
  it('defaults to an unrigged NPC station — today’s behaviour', async () => {
    expect(await hydrated()).toEqual(DEFAULT_FACILITY_DEFAULTS);
  });

  it('round-trips a rigged structure with an owner-set tax', async () => {
    const value: FacilityDefaults = { facility: 'sotiyo', rigLevel: 't2', facilityTaxPct: 2.5 };
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value });
    expect(await hydrated()).toEqual(value);
  });

  it('normalises an incoherent stored record rather than dropping the facility', async () => {
    // The facility is the part the pilot actually chose; discarding it over a
    // stale rig level would be the more surprising outcome.
    await db.settings.put({
      key: FACILITY_DEFAULTS_SETTING_KEY,
      value: { facility: 'npcStation', rigLevel: 't2', facilityTaxPct: 5 },
    });
    expect(await hydrated()).toEqual({
      facility: 'npcStation',
      rigLevel: 'none',
      facilityTaxPct: null,
    });
  });

  it.each([
    ['a facility this build does not know', { facility: 'keepstar', rigLevel: 'none' }],
    ['a bad rig level', { facility: 'azbel', rigLevel: 't3', facilityTaxPct: null }],
    ['a negative tax', { facility: 'azbel', rigLevel: 't1', facilityTaxPct: -1 }],
    ['not an object', 'azbel'],
    ['null', null],
  ])('falls back to the default for %s', async (_label, stored) => {
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: stored });
    expect(await hydrated()).toEqual(DEFAULT_FACILITY_DEFAULTS);
  });

  it('treats an absent tax as "use the preset’s own"', async () => {
    await db.settings.put({
      key: FACILITY_DEFAULTS_SETTING_KEY,
      value: { facility: 'raitaru', rigLevel: 't1' },
    });
    expect(await hydrated()).toEqual({
      facility: 'raitaru',
      rigLevel: 't1',
      facilityTaxPct: null,
    });
  });
});
