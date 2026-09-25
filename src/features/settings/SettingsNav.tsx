import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { cx } from '@/lib/cx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui';
import type { SettingsGroup, SettingsSectionId } from './sections';

const LABEL_KEYS = new Map<string, string>(SETTINGS_TABS.tabs.map((tab) => [tab.id, tab.labelKey]));

interface SettingsNavProps {
  groups: readonly SettingsGroup[];
  value: SettingsSectionId;
  onChange: (id: SettingsSectionId) => void;
}

/**
 * Settings' own navigation: a grouped rail beside the app rail from `md` up,
 * and one grouped select above the section on a phone, where a second column
 * of links would leave no room for the section itself. The rail's entries are
 * real links, so a section can be opened in a new tab or bookmarked; the
 * select is a plain control that navigates on change.
 */
export function SettingsNav({ groups, value, onChange }: SettingsNavProps) {
  const { t } = useTranslation();

  return (
    <>
      <nav
        aria-label={t('settings.navLabel')}
        className="hidden md:sticky md:top-4 md:block md:self-start"
      >
        {groups.map((group) => (
          <div key={group.id} className="mb-3">
            <p className="px-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase">
              {t(group.labelKey)}
            </p>
            <ul className="space-y-px">
              {group.sections.map((id) => {
                const active = id === value;
                return (
                  <li key={id}>
                    <Link
                      to={tabPath(SETTINGS_TABS, id)}
                      aria-current={active ? 'page' : undefined}
                      className={cx(
                        'block border-l-2 px-2 py-1.5 text-xs transition-colors',
                        active
                          ? 'border-accent bg-panel text-text'
                          : 'border-transparent text-text-dim hover:bg-panel-2 hover:text-text'
                      )}
                    >
                      {t(LABEL_KEYS.get(id) ?? id)}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="md:hidden">
        <Select value={value} onValueChange={(id) => onChange(id as SettingsSectionId)}>
          <SelectTrigger aria-label={t('settings.sectionSelectLabel')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectGroup key={group.id}>
                <SelectLabel>{t(group.labelKey)}</SelectLabel>
                {group.sections.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(LABEL_KEYS.get(id) ?? id)}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  );
}
