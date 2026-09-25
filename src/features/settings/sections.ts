import type { SETTINGS_TABS } from '@/app/pageTabs';

export type SettingsSectionId = (typeof SETTINGS_TABS)['tabs'][number]['id'];

export interface SettingsGroup {
  readonly id: 'app' | 'defaults' | 'alerts' | 'data';
  /** i18next key for the group heading in the rail. */
  readonly labelKey: string;
  readonly sections: readonly SettingsSectionId[];
}

/**
 * How the Settings rail files its sections. The order here is the order on
 * screen; a section's label is its `SETTINGS_TABS` entry (`app/pageTabs.ts`),
 * so a section added there and not listed here is routable but has no rail
 * entry — the Settings tests walk every id to catch that.
 */
export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'app',
    labelKey: 'settings.groups.app',
    sections: ['display', 'mobileTabs', 'shortcuts', 'permissions'],
  },
  {
    id: 'defaults',
    labelKey: 'settings.groups.defaults',
    sections: ['industry', 'market', 'characters', 'corporation'],
  },
  { id: 'alerts', labelKey: 'settings.groups.alerts', sections: ['notifications'] },
  {
    id: 'data',
    labelKey: 'settings.groups.data',
    sections: ['dataAge', 'device', 'activity', 'faq'],
  },
];

/**
 * The groups to show, minus what this Character cannot use. Corporation
 * defaults are hidden rather than locked, the same rule the corp nav follows:
 * a setting for a page you cannot open is noise.
 */
export function visibleSettingsGroups(access: { corp: boolean }): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((id) => id !== 'corporation' || access.corp),
  }));
}
