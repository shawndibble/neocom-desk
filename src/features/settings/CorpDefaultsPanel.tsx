import { useTranslation } from 'react-i18next';
import { Fields, Panel } from '@/components/ui';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useDarkThreshold, DARK_AFTER_DAY_OPTIONS } from '@/features/corp/darkThreshold';
import { useCorpAccess } from '@/features/corp/useCorpAccess';
import {
  ChipRow,
  DefaultsSyncHint,
  SettingsHint,
  SettingsPanelLoading,
} from '@/features/settings/settingsFields';

/**
 * The corp roster's inactivity policy. The rail lists it only for a Character
 * who can actually reach the corp section — a setting for a page you cannot
 * open is noise, and this follows the same hide-rather-than-lock rule the corp
 * nav itself uses.
 */
export function CorpDefaultsPanel() {
  const { t } = useTranslation();
  const access = useCorpAccess();
  const darkAfterDays = useDarkThreshold((state) => state.value);
  const setDarkAfterDays = useDarkThreshold((state) => state.setValue);
  const hydrated = useHydratedStore(useDarkThreshold);

  // Reachable by URL even when the rail hides it, so say why it is empty.
  if (access.state !== 'ready') {
    return (
      <Panel>
        <SettingsHint>{t('settings.corpUnavailable')}</SettingsHint>
      </Panel>
    );
  }
  if (!hydrated) return <SettingsPanelLoading />;

  return (
    <Panel>
      <div className="space-y-4">
        <DefaultsSyncHint />
        <Fields variant="form">
          <ChipRow
            label={t('settings.darkThresholdLabel')}
            hint={t('settings.darkThresholdHint')}
            options={DARK_AFTER_DAY_OPTIONS}
            selected={darkAfterDays}
            onSelect={(days) => void setDarkAfterDays(days)}
            labelFor={(days) => t('settings.days', { count: days })}
          />
        </Fields>
      </div>
    </Panel>
  );
}
