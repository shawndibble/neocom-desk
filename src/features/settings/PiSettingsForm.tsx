import { useTranslation } from 'react-i18next';
import { Fields, Spinner } from '@/components/ui';
import { useExpiringWindowHours, EXPIRING_WINDOW_HOUR_OPTIONS } from '@/features/pi/expiringWindow';
import { ChipRow } from './settingsFields';
import { useHydratedStore } from './useHydratedStore';

/** Planetary Industry's settings: Settings → Industry, and the PI page's settings modal. */
export function PiSettingsForm() {
  const { t } = useTranslation();
  const expiringHours = useExpiringWindowHours((state) => state.value);
  const setExpiringHours = useExpiringWindowHours((state) => state.setValue);
  const hydrated = useHydratedStore(useExpiringWindowHours);

  if (!hydrated) return <Spinner />;

  return (
    <Fields variant="form">
      <ChipRow
        label={t('settings.piExpiringLabel')}
        hint={t('settings.piExpiringHint')}
        options={EXPIRING_WINDOW_HOUR_OPTIONS}
        selected={expiringHours}
        onSelect={(hours) => void setExpiringHours(hours)}
        labelFor={(hours) => t('settings.hours', { count: hours })}
      />
    </Fields>
  );
}
