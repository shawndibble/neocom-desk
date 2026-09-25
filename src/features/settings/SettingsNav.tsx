import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { cx } from '@/lib/cx';
import type { SettingsGroup, SettingsSectionId } from './sections';

const LABEL_KEYS = new Map<string, string>(SETTINGS_TABS.tabs.map((tab) => [tab.id, tab.labelKey]));

interface SettingsNavProps {
  groups: readonly SettingsGroup[];
  value: SettingsSectionId;
}

/**
 * Settings' own navigation from `md` up: a grouped rail beside the app rail.
 * Its entries are real links, so a section can be opened in a new tab or
 * bookmarked. A phone has no room for a second column and gets
 * `SettingsIndex` at `/settings` instead.
 */
export function SettingsNav({ groups, value }: SettingsNavProps) {
  const { t } = useTranslation();

  return (
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
  );
}

interface SettingsIndexProps {
  groups: readonly SettingsGroup[];
  /** One-line current value per section, where there is a cheap one. */
  summaries: Partial<Record<SettingsSectionId, string>>;
}

/**
 * The phone's Settings: a full-screen grouped list at `/settings`, each row a
 * push to its section so Back returns here. `SettingsNav` is the same
 * grouping for `md` up.
 */
export function SettingsIndex({ groups, summaries }: SettingsIndexProps) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t('settings.navLabel')} className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`settings-index-${group.id}`}>
          <h2
            id={`settings-index-${group.id}`}
            className="px-1 pb-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase"
          >
            {t(group.labelKey)}
          </h2>
          <ul className="divide-y divide-line border border-line bg-panel">
            {group.sections.map((id) => {
              const summary = summaries[id];
              return (
                <li key={id}>
                  <Link
                    to={tabPath(SETTINGS_TABS, id)}
                    className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-panel-2"
                  >
                    <span className="min-w-0">
                      <span className="block text-text">{t(LABEL_KEYS.get(id) ?? id)}</span>
                      {summary && (
                        <span className="block truncate text-xs text-text-dim">{summary}</span>
                      )}
                    </span>
                    <span aria-hidden="true" className="text-text-dim">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** On a phone, a section's way back to the list; the page header's right-hand side. */
export function SettingsBackLink() {
  const { t } = useTranslation();

  return (
    <Link
      to={SETTINGS_TABS.base}
      className="inline-flex min-h-11 items-center gap-1 px-2 text-xs text-text-dim hover:text-text md:hidden"
    >
      <span aria-hidden="true">‹</span>
      {t('settings.backToList')}
    </Link>
  );
}
