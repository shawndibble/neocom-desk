/**
 * Settings > Notifications > Alerts when closed: the Quiet time rows (issue
 * #4566). One switch; on, two time inputs and "Let attacks through". Per
 * device, so it sits with the device's other delivery choices, and it applies
 * to everything pushed to a closed app. A change re-uploads through the
 * Projection rebuild (`preferences.ts`), so no separate save step.
 */
import { useTranslation } from 'react-i18next';
import { Checkbox, TextInput } from '@/components/ui';
import { tappableRowClassName } from '@/components/ui/controlStyles';
import { cx } from '@/lib/cx';
import { setDeviceNotificationPrefs, useNotificationPreferences } from './preferences';
import { quietTimeView, withQuietTime } from './quietTime';

export function QuietTimeRows() {
  const { t } = useTranslation();
  const prefs = useNotificationPreferences((state) => state.value);
  const quiet = quietTimeView(prefs);
  const save = (patch: Parameters<typeof withQuietTime>[1]) =>
    void setDeviceNotificationPrefs(withQuietTime(prefs, patch));
  const rowClassName = cx('flex items-center gap-2 text-xs text-text', tappableRowClassName);

  return (
    <div className="space-y-1" data-testid="quiet-time">
      <label className={cx(rowClassName, 'font-medium')}>
        <Checkbox
          aria-describedby="quiet-time-hint"
          checked={quiet.enabled}
          onChange={() => save({ enabled: !quiet.enabled })}
        />
        {t('settings.notifications.quietTime.label')}
      </label>
      <p id="quiet-time-hint" className="text-[0.6875rem] text-text-dim">
        {t('settings.notifications.quietTime.hint')}
      </p>
      {quiet.enabled && (
        <div className="space-y-1 pl-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text">
            <label className="flex items-center gap-2">
              {t('settings.notifications.quietTime.start')}
              <TextInput
                size="sm"
                type="time"
                value={quiet.start}
                onChange={(event) => save({ start: event.target.value })}
              />
            </label>
            <label className="flex items-center gap-2">
              {t('settings.notifications.quietTime.end')}
              <TextInput
                size="sm"
                type="time"
                value={quiet.end}
                onChange={(event) => save({ end: event.target.value })}
              />
            </label>
          </div>
          <label className={rowClassName}>
            <Checkbox
              checked={quiet.allowAttacks}
              onChange={() => save({ allowAttacks: !quiet.allowAttacks })}
            />
            {t('settings.notifications.quietTime.allowAttacks')}
          </label>
        </div>
      )}
    </div>
  );
}
