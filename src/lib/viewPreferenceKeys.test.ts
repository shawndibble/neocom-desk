import { describe, expect, it } from 'vitest';
import { VIEW_PREFERENCE_KEYS } from './viewPreferenceKeys';
import { CALENDAR_VIEW_KEY } from '@/features/character/calendarViewPref';
import { ASSET_SORT_SETTING_KEY } from '@/features/character/assetSortPreference';
import { FONT_SCALE_KEY } from '@/lib/fontScale';
import { TIME_FORMAT_SETTING_KEY } from '@/lib/timeFormat';
import { MARKET_HUB_SETTING_KEY } from '@/features/market/hub';
import { ASSUMED_ME_SETTING_KEY } from '@/features/industry/assumedMe';
import { DARK_THRESHOLD_SETTING_KEY } from '@/features/corp/darkThreshold';
import { PI_EXPIRING_WINDOW_SETTING_KEY } from '@/features/pi/expiringWindow';
import { FACILITY_DEFAULTS_SETTING_KEY } from '@/features/industry/facilityDefaults';
import { STARRED_CHARACTERS_SETTING_KEY } from '@/features/character/starredCharacters';

/**
 * Pinned literal, exactly as `sync/syncedSettings.test.ts` pins its own list.
 * Adding a key is a two-file edit on purpose — see the module comment for what
 * belongs and, more importantly, what must never be added.
 */
const PINNED = [
  'assetsItemSort',
  'assetsRoutePreference',
  'assetsStationSort',
  'calendarView',
  'corp.assetsExpanded',
  'industryLastOpenedPlan',
  'loyaltyStorePriceBasis',
  'marketLocationMode',
  'marketPriceHistoryRange',
  'miningTaxStatusFilter',
  'piAdvisorAltColonies',
  'piColoniesShowAlts',
  'piMarketSourcing',
  'piPlanControls',
  'planColumnVisibility.v2',
  'planGroupingMode',
];

describe('VIEW_PREFERENCE_KEYS', () => {
  it('is exactly the pinned list', () => {
    expect([...VIEW_PREFERENCE_KEYS]).toEqual(PINNED);
  });

  it('holds no duplicates', () => {
    expect(new Set(VIEW_PREFERENCE_KEYS).size).toBe(VIEW_PREFERENCE_KEYS.length);
  });

  it('never clears a preference that has its own Settings control', () => {
    // A pilot who set one of these deliberately would not expect a button
    // labelled "view preferences" to revert it.
    for (const key of [
      FONT_SCALE_KEY,
      TIME_FORMAT_SETTING_KEY,
      MARKET_HUB_SETTING_KEY,
      ASSUMED_ME_SETTING_KEY,
      DARK_THRESHOLD_SETTING_KEY,
      PI_EXPIRING_WINDOW_SETTING_KEY,
      FACILITY_DEFAULTS_SETTING_KEY,
    ]) {
      expect(VIEW_PREFERENCE_KEYS).not.toContain(key);
    }
  });

  it('never clears user-created content', () => {
    // These are work the pilot did on purpose, not a remembered sort order.
    for (const key of [
      STARRED_CHARACTERS_SETTING_KEY,
      'overviewGroups',
      'comparisons',
      'miningTax.manualMoonOreTypeIds',
      'miningTax.manualIgnoredTypeIds',
      'activeCharacterId',
    ]) {
      expect(VIEW_PREFERENCE_KEYS).not.toContain(key);
    }
  });

  it('never clears a synced key — that namespace is planSync’s', () => {
    expect(VIEW_PREFERENCE_KEYS.filter((key) => key.startsWith('sync.'))).toEqual([]);
  });

  it('lists keys the app actually declares', () => {
    // Spot-check against the real constants, so a renamed key fails here
    // rather than silently dropping out of the reset.
    expect(VIEW_PREFERENCE_KEYS).toContain(CALENDAR_VIEW_KEY);
    expect(VIEW_PREFERENCE_KEYS).toContain(ASSET_SORT_SETTING_KEY);
  });
});
