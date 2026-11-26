import { describe, expect, it } from 'vitest';
import { VIEW_PREFERENCE_KEYS } from './viewPreferenceKeys';
import { CALENDAR_VIEW_KEY } from '@/features/character/calendarViewPref';
import { ASSET_SORT_SETTING_KEY } from '@/features/assets/assetSortPreference';
import { FONT_SCALE_KEY } from '@/lib/fontScale';
import { NUMBER_FORMAT_SETTING_KEY } from '@/lib/numberFormat';
import { TIME_FORMAT_SETTING_KEY } from '@/lib/timeFormat';
import { MARKET_HUB_SETTING_KEY } from '@/features/market/hub';
import { ASSUMED_ME_SETTING_KEY } from '@/features/industry/assumedMe';
import { ASSUMED_TE_SETTING_KEY } from '@/features/industry/assumedTe';
import { DARK_THRESHOLD_SETTING_KEY } from '@/features/corp/darkThreshold';
import { PI_EXPIRING_WINDOW_SETTING_KEY } from '@/features/pi/expiringWindow';
import { FACILITY_DEFAULTS_SETTING_KEY } from '@/features/industry/facilityDefaults';
import { STARRED_CHARACTERS_SETTING_KEY } from '@/features/character/starredCharacters';

const PINNED = [
  'assetsItemSort',
  'assetsRoutePreference',
  'assetsStationSort',
  'calendarCorpFilter',
  'calendarHiddenKinds',
  'calendarView',
  'characterFilterPicks',
  'corp.assetsExpanded',
  'industryLastOpenedPlan',
  'industryProfitBasis',
  'loyaltyStorePriceBasis',
  'mailFolders',
  'marketLocationMode',
  'marketPriceHistoryColumns',
  'marketPriceHistoryRange',
  'marketPriceHistorySeries',
  'marketWideSalesShare',
  'piColoniesShowAlts',
  'piPlanControls',
  'pilotLookupLocalGrouping',
  'planColumnVisibility.v2',
  'planGroupingMode',
  'walletJournalBreakdownOpen',
  'walletJournalBreakdownView',
  'walletJournalFlowChartHidden',
];

describe('VIEW_PREFERENCE_KEYS', () => {
  it('is exactly the pinned list', () => {
    expect([...VIEW_PREFERENCE_KEYS]).toEqual(PINNED);
  });

  it('holds no duplicates', () => {
    expect(new Set(VIEW_PREFERENCE_KEYS).size).toBe(VIEW_PREFERENCE_KEYS.length);
  });

  it('never clears a preference that has its own Settings control', () => {
    for (const key of [
      FONT_SCALE_KEY,
      TIME_FORMAT_SETTING_KEY,
      NUMBER_FORMAT_SETTING_KEY,
      MARKET_HUB_SETTING_KEY,
      ASSUMED_ME_SETTING_KEY,
      ASSUMED_TE_SETTING_KEY,
      DARK_THRESHOLD_SETTING_KEY,
      PI_EXPIRING_WINDOW_SETTING_KEY,
      FACILITY_DEFAULTS_SETTING_KEY,
    ]) {
      expect(VIEW_PREFERENCE_KEYS).not.toContain(key);
    }
  });

  it('never clears user-created content', () => {
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
    expect(VIEW_PREFERENCE_KEYS).toContain(CALENDAR_VIEW_KEY);
    expect(VIEW_PREFERENCE_KEYS).toContain(ASSET_SORT_SETTING_KEY);
  });
});
