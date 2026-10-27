import { describe, expect, it } from 'vitest';
import { SETTINGS_TABS } from '@/app/pageTabs';
import en from '@/i18n/locales/en.json';
import { SETTINGS_GROUPS, visibleSettingsGroups } from './sections';

describe('settings sections', () => {
  it('files every routable section under exactly one group', () => {
    const filed = SETTINGS_GROUPS.flatMap((group) => group.sections);
    expect([...filed].sort()).toEqual(SETTINGS_TABS.tabs.map((tab) => tab.id).sort());
  });

  it('writes every section label and panel title in sentence case, without "defaults"', () => {
    const keep = ['Planetary Industry', 'BPC Sourcing', 'EVE', 'PI', 'BPC', 'Thera'];
    const labels = [
      ...SETTINGS_TABS.tabs.map(
        (tab) => en.settings.tabs[tab.labelKey.split('.').pop() as keyof typeof en.settings.tabs]
      ),
      ...Object.values(en.settings.groups),
      en.settings.industryBlueprintTitle,
      en.settings.installTitle,
      en.settings.analyticsTitle,
      en.settings.dataTitle,
      en.settings.backup.exportTitle,
      en.settings.backup.importTitle,
      en.settings.mobileTabs.title,
      en.settings.travel.routeTitle,
      en.settings.travel.networkTitle,
      en.settings.avoidedSystems.title,
      en.activityLog.title,
      en.dataAge.title,
    ];
    for (const label of labels) {
      if (label !== en.settings.groups.defaults) expect(label, label).not.toMatch(/defaults/i);
      const stripped = keep.reduce((text, term) => text.replaceAll(term, ''), label);
      expect(stripped.split(/\s+/).slice(1), label).not.toContainEqual(
        expect.stringMatching(/^[A-Z][a-z]/)
      );
    }
  });

  it('shows Corporation only when the character can reach a corporation', () => {
    const ids = (corp: boolean) =>
      visibleSettingsGroups({ corp }).flatMap((group) => group.sections);
    expect(ids(true)).toContain('corporation');
    expect(ids(false)).not.toContain('corporation');
  });
});
