import { SETTINGS_TABS } from '@/app/pageTabs';

export type SettingsSectionId = (typeof SETTINGS_TABS)['tabs'][number]['id'];

export interface SettingsGroup {
  readonly id: 'preferences' | 'defaults' | 'account' | 'data';
  readonly labelKey: string;
  readonly sections: readonly SettingsSectionId[];
}

export const SETTINGS_GROUPS: readonly SettingsGroup[] = [
  {
    id: 'preferences',
    labelKey: 'settings.groups.preferences',
    sections: ['display', 'notifications'],
  },
  {
    id: 'defaults',
    labelKey: 'settings.groups.defaults',
    sections: ['industry', 'pi', 'market', 'miningTax', 'characters', 'corporation', 'travel'],
  },
  {
    id: 'account',
    labelKey: 'settings.groups.account',
    sections: ['permissions', 'app', 'device'],
  },
  {
    id: 'data',
    labelKey: 'settings.groups.data',
    sections: ['dataAge', 'offline', 'activity'],
  },
];

export function visibleSettingsGroups(access: { corp: boolean }): SettingsGroup[] {
  return SETTINGS_GROUPS.map((group) => ({
    ...group,
    sections: group.sections.filter((id) => id !== 'corporation' || access.corp),
  }));
}

const LABEL_KEYS = new Map<string, string>(SETTINGS_TABS.tabs.map((tab) => [tab.id, tab.labelKey]));

export const settingsSectionLabelKey = (id: string) => LABEL_KEYS.get(id) ?? id;
