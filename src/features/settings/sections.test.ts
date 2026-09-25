import { describe, expect, it } from 'vitest';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { SETTINGS_GROUPS, visibleSettingsGroups } from './sections';

describe('settings sections', () => {
  it('files every routable section under exactly one group', () => {
    const filed = SETTINGS_GROUPS.flatMap((group) => group.sections);
    expect([...filed].sort()).toEqual(SETTINGS_TABS.tabs.map((tab) => tab.id).sort());
  });

  it('shows Corporation only when the character can reach a corporation', () => {
    const ids = (corp: boolean) =>
      visibleSettingsGroups({ corp }).flatMap((group) => group.sections);
    expect(ids(true)).toContain('corporation');
    expect(ids(false)).not.toContain('corporation');
  });
});
