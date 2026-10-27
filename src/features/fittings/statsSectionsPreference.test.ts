import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/db';
import {
  STATS_SECTIONS_SETTING_KEY,
  isSectionExpanded,
  parseStatsSections,
  useStatsSectionsPreference,
  withSectionExpanded,
} from './statsSectionsPreference';

describe('parseStatsSections', () => {
  it('keeps each section id with a boolean, and drops the rest', () => {
    expect(parseStatsSections({ defense: false, offense: true, junk: 'yes', n: 1 })).toEqual({
      defense: false,
      offense: true,
    });
  });

  it('reads anything that is not a plain object as nothing stored', () => {
    expect(parseStatsSections(null)).toBeNull();
    expect(parseStatsSections('defense')).toBeNull();
    expect(parseStatsSections(['defense'])).toBeNull();
  });
});

describe('isSectionExpanded', () => {
  it('follows what the pilot chose for a section', () => {
    expect(
      isSectionExpanded({ targeting: true }, 'targeting', { isPhone: true, openByDefault: false })
    ).toBe(true);
    expect(
      isSectionExpanded({ offense: false }, 'offense', { isPhone: false, openByDefault: true })
    ).toBe(false);
  });

  it('starts an untouched section as the layout does: open by default on desktop, collapsed on a phone', () => {
    expect(isSectionExpanded({}, 'offense', { isPhone: false, openByDefault: true })).toBe(true);
    expect(isSectionExpanded({}, 'price', { isPhone: false, openByDefault: false })).toBe(false);
    expect(isSectionExpanded({}, 'offense', { isPhone: true, openByDefault: true })).toBe(false);
  });
});

describe('withSectionExpanded', () => {
  it('records one section without touching the others', () => {
    expect(withSectionExpanded({ offense: true }, 'defense', false)).toEqual({
      offense: true,
      defense: false,
    });
  });
});

describe('useStatsSectionsPreference', () => {
  beforeEach(async () => {
    await db.settings.clear();
  });

  it('persists the map under its own device-local key and reads it back', async () => {
    await useStatsSectionsPreference.getState().setValue({ mining: true });
    expect(await db.settings.get(STATS_SECTIONS_SETTING_KEY)).toEqual({
      key: STATS_SECTIONS_SETTING_KEY,
      value: { mining: true },
    });
    await useStatsSectionsPreference.getState().hydrate();
    expect(useStatsSectionsPreference.getState().value).toEqual({ mining: true });
  });
});
