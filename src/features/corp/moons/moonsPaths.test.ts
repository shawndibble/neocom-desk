import { describe, expect, it } from 'vitest';
import { tabBarTabs } from '@/lib/pageTabs';
import {
  MOONS_TABS,
  lateNoticesTabPath,
  legacyMoonsLocation,
  moonsDetail,
  refineryPath,
  sharingMoonPath,
} from './moonsPaths';

describe('legacyMoonsLocation', () => {
  it('sends the retired Sharing tab to Moon settings on Sharing, keeping its query', () => {
    expect(legacyMoonsLocation('/corp/moons/sharing', '?highlight=7')).toEqual({
      pathname: '/corp/moons/overview',
      search: '?highlight=7&settings=sharing',
    });
    expect(legacyMoonsLocation('/corp/moons/sharing/', '')).toEqual({
      pathname: '/corp/moons/overview',
      search: '?settings=sharing',
    });
  });

  it('leaves other paths to the default-tab redirect', () => {
    expect(legacyMoonsLocation('/corp/moons', '')).toBeNull();
    expect(legacyMoonsLocation('/corp/moons/bogus', '')).toBeNull();
  });
});

describe('sharingMoonPath', () => {
  it('opens Moon settings on Sharing at a moon', () => {
    expect(sharingMoonPath(9)).toBe('/corp/moons/extractions?settings=sharing&highlight=9');
  });
});

describe('a refinery page', () => {
  it('lives below the Refineries tab and reads back', () => {
    const path = refineryPath(1001);
    expect(path).toBe('/corp/moons/refineries/1001');
    expect(moonsDetail(path)).toEqual({ kind: 'refinery', structureId: 1001 });
    expect(moonsDetail(`${path}/`)).toMatchObject({ kind: 'refinery' });
  });

  it('leaves the Refineries tab, the moon owner page and a bad refinery id alone', () => {
    expect(moonsDetail('/corp/moons/refineries')).toBeNull();
    expect(moonsDetail('/corp/moons/refineries/x')).toBeNull();
    expect(moonsDetail('/corp/moons/moon-owners/98')).toEqual({ kind: 'moonOwner', id: '98' });
  });

  it('knows the retired moon and moon owner refinery URLs', () => {
    expect(moonsDetail('/corp/moons/moons/55')).toEqual({ kind: 'legacyMoon', id: '55' });
    expect(moonsDetail('/corp/moons/moon-owners/98/refineries/1001')).toEqual({
      kind: 'legacyRefinery',
      structureId: 1001,
    });
  });

  it('knows the retired period URL, which redirects to the Late notices tab', () => {
    expect(moonsDetail('/corp/moons/statements/2026-08-01')).toEqual({
      kind: 'legacyStatementPeriod',
    });
  });

  it('names the Late notices tab for what it is, keeping its old URL off the tab bar', () => {
    expect(lateNoticesTabPath).toBe('/corp/moons/late-notices');
    const shown = tabBarTabs(MOONS_TABS).map((tab) => tab.id);
    expect(shown).toContain('late-notices');
    expect(shown).not.toContain('statements');
  });
});
