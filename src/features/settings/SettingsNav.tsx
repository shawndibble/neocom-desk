import { eyebrowClassName } from '@/components/ui/eyebrowClassName';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { SETTINGS_TABS } from '@/app/pageTabs';
import { tabPath } from '@/lib/pageTabs';
import { cx } from '@/lib/cx';
import {
  focusRingClassName,
  focusRingInsetClassName,
  interactiveClassName,
  rowInteractiveClassName,
} from '@/components/ui/controlStyles';
import * as Icon from '@/components/ui/icons';
import { Button, LiveStatus } from '@/components/ui';
import { ActionResult } from './settingsFields';
import { useApplyUpdate, useUpdateStatusLine } from './useUpdateState';
import { useStorageAtRisk } from './storageAtRisk';
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
  const updateAvailable = useUpdateStatusLine().status === 'available';
  const storageAtRisk = useStorageAtRisk((s) => s.atRisk);

  return (
    <nav
      aria-label={t('settings.navLabel')}
      className="hidden md:sticky md:top-4 md:block md:self-start"
    >
      {groups.map((group) => (
        <div key={group.id} className="mb-3">
          <p
            id={`settings-nav-${group.id}`}
            className="px-2 pb-1 text-[0.625rem] font-semibold tracking-widest text-text-dim uppercase"
          >
            {t(group.labelKey)}
          </p>
          <ul aria-labelledby={`settings-nav-${group.id}`} className="space-y-px">
            {group.sections.map((id) => {
              const active = id === value;
              return (
                <li key={id}>
                  <Link
                    to={tabPath(SETTINGS_TABS, id)}
                    aria-current={active ? 'page' : undefined}
                    className={cx(
                      'block border-l-2 px-2 py-1.5 text-xs',
                      interactiveClassName,
                      focusRingInsetClassName,
                      active
                        ? 'border-accent bg-panel text-text'
                        : 'border-transparent text-text-dim hover:bg-panel-2 hover:text-text active:bg-panel'
                    )}
                  >
                    {t(LABEL_KEYS.get(id) ?? id)}
                    {id === 'app' && updateAvailable && (
                      <AttentionDot label={t('settings.update.available')} />
                    )}
                    {id === 'offline' && storageAtRisk && (
                      <AttentionDot label={t('settings.offline.atRisk')} />
                    )}
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

/** §6c: something inside this section needs attention now; clears when handled. */
function AttentionDot({ label }: { label: string }) {
  return (
    <span
      role="img"
      aria-label={label}
      className="ml-1.5 inline-block size-1.5 rounded-full bg-accent align-middle"
    />
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
  const { status, line } = useUpdateStatusLine();
  const { updating, failed, update } = useApplyUpdate();
  const storageAtRisk = useStorageAtRisk((s) => s.atRisk);

  return (
    <nav aria-label={t('settings.navLabel')} className="space-y-4">
      {groups.map((group) => (
        <section key={group.id} aria-labelledby={`settings-index-${group.id}`}>
          <h2 id={`settings-index-${group.id}`} className={cx(eyebrowClassName, 'px-1 pb-1')}>
            {t(group.labelKey)}
          </h2>
          <ul className="divide-y divide-line border border-line bg-panel">
            {group.sections.map((id) => {
              const isApp = id === 'app';
              const highlighted = isApp && status === 'available';
              const summary = isApp ? line : summaries[id];
              return (
                <li
                  key={id}
                  className={highlighted ? 'border-l-2 border-accent bg-accent/10' : undefined}
                >
                  {isApp && <LiveStatus>{line}</LiveStatus>}
                  <div className="flex items-center">
                    <Link
                      to={tabPath(SETTINGS_TABS, id)}
                      className={cx(
                        'group flex min-h-11 min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2 text-sm',
                        rowInteractiveClassName,
                        focusRingInsetClassName
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block text-text">
                          {t(LABEL_KEYS.get(id) ?? id)}
                          {id === 'offline' && storageAtRisk && (
                            <AttentionDot label={t('settings.offline.atRisk')} />
                          )}
                        </span>
                        {(summary || isApp) && (
                          <span
                            className={cx(
                              'block truncate text-xs',
                              isApp && 'min-h-4',
                              highlighted ? 'text-accent' : 'text-text-dim'
                            )}
                          >
                            {summary}
                          </span>
                        )}
                      </span>
                      <Icon.Descend
                        size={Icon.ICON_SIZE.sm}
                        aria-hidden="true"
                        className="shrink-0 text-text-faint group-hover:text-accent group-focus-visible:text-accent"
                      />
                    </Link>
                    {highlighted && (
                      <Button
                        size="md"
                        variant="accent"
                        className="mr-2 shrink-0"
                        loading={updating}
                        onClick={update}
                      >
                        {t('settings.updateAction')}
                      </Button>
                    )}
                  </div>
                  {isApp && failed && (
                    <div className="px-3 pb-2">
                      <ActionResult kind="error">{t('settings.updateFailed')}</ActionResult>
                    </div>
                  )}
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
      className={cx(
        'inline-flex min-h-11 items-center gap-1 rounded-xs px-2 text-xs text-text-dim hover:text-text active:text-text-dim md:hidden',
        interactiveClassName,
        focusRingClassName
      )}
    >
      <span aria-hidden="true">‹</span>
      {t('settings.backToList')}
    </Link>
  );
}
