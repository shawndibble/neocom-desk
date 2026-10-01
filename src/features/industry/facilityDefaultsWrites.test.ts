// Its own file because `hydrateActivityFacilityDefaults` runs the one-time
// refinery adoption at most once per module instance: the race below needs
// to be the first thing in the module to start it.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/db';
import { EMPTY_RIG_FIT } from '@/engine/industry/types';
import {
  DEFAULT_FACILITY_DEFAULTS,
  FACILITY_DEFAULTS_SETTING_KEY,
  loadActivityFacilityDefaults,
  rememberActivityLocations,
  useFacilityDefaults,
  type FacilityDefaults,
} from './facilityDefaults';
import {
  DEFAULT_REACTION_FACILITY_DEFAULTS,
  REACTION_FACILITY_DEFAULTS_SETTING_KEY,
  useReactionFacilityDefaults,
} from './reactionFacilityDefaults';

const BADIVEFI_AZBEL: FacilityDefaults = {
  facility: 'azbel',
  rigFit: ['meT1', 'none', 'none'],
  facilityTaxPct: 4,
  buildSystemId: 30003888,
  buildSystemName: 'Badivefi',
  setOnPlanPage: true,
};

beforeEach(async () => {
  await db.settings.clear();
  useFacilityDefaults.setState({ value: DEFAULT_FACILITY_DEFAULTS, hydrated: false });
  useReactionFacilityDefaults.setState({
    value: DEFAULT_REACTION_FACILITY_DEFAULTS,
    hydrated: false,
  });
});

describe('rememberActivityLocations', () => {
  it('lands after the one-time refinery adoption, never under it', async () => {
    // A pre-split refinery in the manufacturing key: the adoption moves it to
    // the reaction key and resets this one. A plan-page write that raced it
    // would be overwritten on disk by that reset.
    const tatara = { facility: 'tatara', rigFit: EMPTY_RIG_FIT, facilityTaxPct: 2 };
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: tatara });

    await rememberActivityLocations({ manufacturing: BADIVEFI_AZBEL });

    expect((await db.settings.get(FACILITY_DEFAULTS_SETTING_KEY))?.value).toEqual(BADIVEFI_AZBEL);
    expect((await db.settings.get(REACTION_FACILITY_DEFAULTS_SETTING_KEY))?.value).toEqual(tatara);
  });

  it('writes a changed record to its own store', async () => {
    await rememberActivityLocations({ manufacturing: BADIVEFI_AZBEL });
    expect(useFacilityDefaults.getState().value).toEqual(BADIVEFI_AZBEL);
    expect(useReactionFacilityDefaults.getState().value).toEqual(
      DEFAULT_REACTION_FACILITY_DEFAULTS
    );
  });

  it('skips a record equal to the one already remembered', async () => {
    // Each write pushes to Firestore and reschedules sync for every Character.
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: BADIVEFI_AZBEL });
    const put = vi.spyOn(db.settings, 'put');
    try {
      await rememberActivityLocations({
        manufacturing: { ...BADIVEFI_AZBEL, rigFit: ['meT1', 'none', 'none'] },
      });
      expect(put).not.toHaveBeenCalled();
    } finally {
      put.mockRestore();
    }
  });
});

describe('loadActivityFacilityDefaults', () => {
  it('reads what is on disk, not the store’s unhydrated default', async () => {
    await db.settings.put({ key: FACILITY_DEFAULTS_SETTING_KEY, value: BADIVEFI_AZBEL });
    expect((await loadActivityFacilityDefaults()).manufacturing).toEqual(BADIVEFI_AZBEL);
  });
});
