import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, FilterChip, Panel } from '@/components/ui';
import { SettingsHint, SettingsScopeHint } from '@/features/settings/settingsFields';
import {
  DEFAULT_MOBILE_TABS,
  MOBILE_TAB_CHOICES,
  MOBILE_TAB_COUNT,
  NAV_LABEL_KEYS,
  sortMobileTabs,
  useMobileTabs,
  type MobileTabPath,
} from '@/lib/mobileTabs';

export function MobileTabsPanel() {
  const { t } = useTranslation();
  const tabs = useMobileTabs((state) => state.value);
  const setTabs = useMobileTabs((state) => state.setValue);

  const [pending, setPending] = useState<readonly MobileTabPath[] | null>(null);
  const draft = pending ?? tabs;
  const full = draft.length >= MOBILE_TAB_COUNT;

  function toggle(path: MobileTabPath) {
    const next = draft.includes(path)
      ? draft.filter((chosen) => chosen !== path)
      : sortMobileTabs([...draft, path]);
    if (next.length === MOBILE_TAB_COUNT) {
      setPending(null);
      void setTabs(next);
      return;
    }
    setPending(next);
  }

  function reset() {
    setPending(null);
    void setTabs(DEFAULT_MOBILE_TABS);
  }

  return (
    <Panel title={t('settings.mobileTabs.title')}>
      <div className="space-y-2">
        <SettingsScopeHint scope="device" />
        <SettingsHint>{t('settings.mobileTabs.hint')}</SettingsHint>
        <div
          role="group"
          aria-label={t('settings.mobileTabs.group')}
          className="flex flex-wrap gap-2"
        >
          {MOBILE_TAB_CHOICES.map((path) => {
            const selected = draft.includes(path);
            return (
              <FilterChip
                key={path}
                label={t(NAV_LABEL_KEYS[path])}
                selected={selected}
                disabled={!selected && full}
                tooltip={!selected && full ? t('settings.mobileTabs.full') : undefined}
                onToggle={() => toggle(path)}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-text-dim" aria-live="polite">
            {t('settings.mobileTabs.chosen', { count: draft.length, total: MOBILE_TAB_COUNT })}
          </p>
          <Button size="sm" onClick={reset}>
            {t('settings.mobileTabs.reset')}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
