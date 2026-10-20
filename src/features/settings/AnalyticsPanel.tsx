import { useTranslation } from 'react-i18next';
import { touchCheckboxLabelClassName } from '@/components/ui/controlStyles';
import { Checkbox, Field, Fields, Panel, Spinner } from '@/components/ui';
import { useAnalyticsEnabled } from '@/app/analyticsPref';
import { useHydratedStore } from '@/lib/useHydratedStore';

/** Settings → App: the device-local switch for Google Analytics page views. */
export function AnalyticsPanel() {
  const { t } = useTranslation();
  const hydrated = useHydratedStore(useAnalyticsEnabled);
  const enabled = useAnalyticsEnabled((state) => state.value);
  const setEnabled = useAnalyticsEnabled((state) => state.setValue);

  return (
    <Panel title={t('settings.analyticsTitle')}>
      {hydrated ? (
        <Fields variant="form">
          <Field
            label={t('settings.analyticsLabel')}
            htmlFor="analytics-enabled"
            inline
            note={t('settings.analyticsHint')}
          >
            <label className={touchCheckboxLabelClassName}>
              <Checkbox
                id="analytics-enabled"
                checked={enabled}
                onChange={() => void setEnabled(!enabled)}
              />
            </label>
          </Field>
        </Fields>
      ) : (
        <Spinner />
      )}
    </Panel>
  );
}
