import { useTranslation } from 'react-i18next';
import { Fields, Panel } from '@/components/ui';
import { useAnalyticsEnabled } from '@/app/analyticsPref';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { CheckboxField, SettingsPanelLoading, SettingsScopeHint } from './settingsFields';

/** Settings → Data & storage: the device-local switch for Google Analytics page views. */
export function AnalyticsPanel() {
  const { t } = useTranslation();
  const hydrated = useHydratedStore(useAnalyticsEnabled);
  const enabled = useAnalyticsEnabled((state) => state.value);
  const setEnabled = useAnalyticsEnabled((state) => state.setValue);

  if (!hydrated) return <SettingsPanelLoading title={t('settings.analyticsTitle')} />;

  return (
    <Panel title={t('settings.analyticsTitle')}>
      <div className="space-y-4">
        <SettingsScopeHint scope="device" />
        <Fields variant="form">
          <CheckboxField
            id="analytics-enabled"
            label={t('settings.analyticsLabel')}
            hint={t('settings.analyticsHint')}
            checked={enabled}
            onChange={() => void setEnabled(!enabled)}
          />
        </Fields>
      </div>
    </Panel>
  );
}
