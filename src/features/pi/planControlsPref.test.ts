import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import {
  usePlanControls,
  parsePiPlanControls,
  PI_PLAN_CONTROLS_KEY,
  DEFAULT_PI_PLAN_CONTROLS,
} from './planControlsPref';

const AMARR_PER_TIER = { hubId: 'amarr', layout: 'planet-per-tier', floor: 'P2' } as const;

beforeEach(async () => {
  await db.settings.clear();
  usePlanControls.setState({ value: DEFAULT_PI_PLAN_CONTROLS, hydrated: false });
});

describe('parsePiPlanControls', () => {
  it('accepts a complete, valid record', () => {
    expect(parsePiPlanControls({ ...AMARR_PER_TIER })).toEqual(AMARR_PER_TIER);
  });

  /**
   * Hubs can retire between releases, which is exactly the case a `typeof`
   * check waves through: 'yulai' is a perfectly good string that names no
   * market, and the panel would price the whole chain against nothing.
   */
  it('rejects a hub id that no longer names a hub', () => {
    expect(parsePiPlanControls({ ...AMARR_PER_TIER, hubId: 'yulai' })).toBeNull();
  });

  it('rejects an unknown layout', () => {
    expect(parsePiPlanControls({ ...AMARR_PER_TIER, layout: 'planet-per-pin' })).toBeNull();
  });

  it('rejects a floor above the tiers a chain can be sourced from', () => {
    expect(parsePiPlanControls({ ...AMARR_PER_TIER, floor: 'P4' })).toBeNull();
  });

  /**
   * Whole-record reject, not a per-field merge: `createLocalSetting` coerces a
   * null straight to `defaultValue`, so a half-restored rail — the pilot's own
   * hub beside a layout they never chose — is never a state the panel can be in.
   */
  it('rejects the whole record when only one field is bad', () => {
    expect(parsePiPlanControls({ hubId: 'amarr', layout: 'planet-per-tier' })).toBeNull();
    expect(parsePiPlanControls({ ...AMARR_PER_TIER, floor: 42 })).toBeNull();
  });

  it('rejects values that are not records at all', () => {
    expect(parsePiPlanControls(null)).toBeNull();
    expect(parsePiPlanControls('amarr')).toBeNull();
    expect(parsePiPlanControls([AMARR_PER_TIER])).toBeNull();
  });
});

describe('usePlanControls', () => {
  it('defaults to Jita, one planet and the P1 floor — the panel’s opening state', () => {
    expect(usePlanControls.getState().value).toEqual({
      hubId: 'jita',
      layout: 'single-planet',
      floor: 'P1',
    });
    expect(usePlanControls.getState().hydrated).toBe(false);
  });

  it('persists all three fields under one piPlanControls key', async () => {
    await usePlanControls.getState().setValue({ ...AMARR_PER_TIER });
    expect((await db.settings.get(PI_PLAN_CONTROLS_KEY))?.value).toEqual(AMARR_PER_TIER);
  });

  it('applies a persisted record on hydrate', async () => {
    await db.settings.put({ key: PI_PLAN_CONTROLS_KEY, value: { ...AMARR_PER_TIER } });
    await usePlanControls.getState().hydrate();
    expect(usePlanControls.getState().value).toEqual(AMARR_PER_TIER);
  });

  it('falls back to every default when the stored record is malformed', async () => {
    await db.settings.put({ key: PI_PLAN_CONTROLS_KEY, value: { hubId: 'yulai' } });
    await usePlanControls.getState().hydrate();
    expect(usePlanControls.getState().value).toEqual(DEFAULT_PI_PLAN_CONTROLS);
  });
});
