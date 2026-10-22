import { useTranslation } from 'react-i18next';
import { Fields } from '@/components/ui';
import {
  CALENDAR_WEEK_START_DAYS,
  useCalendarWeekStart,
} from '@/features/character/calendarWeekStart';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { TIME_FORMATS, useTimeFormat } from '@/lib/timeFormat';
import { ChipRow, SettingsFormLoading } from './settingsFields';

/**
 * The two Display settings the Calendar leans on, time format and which day
 * the week starts on: the Calendar page's settings modal. They are the same
 * stores Settings → Display edits (`useTimeFormat`, `useCalendarWeekStart`),
 * so the two surfaces can never disagree.
 */
export function CalendarSettingsForm() {
  const { t } = useTranslation();
  const timeFormat = useTimeFormat((state) => state.value);
  const setTimeFormat = useTimeFormat((state) => state.setValue);
  const weekStart = useCalendarWeekStart((state) => state.value);
  const setWeekStart = useCalendarWeekStart((state) => state.setValue);
  const hydrated = useHydratedStore(useCalendarWeekStart);
  if (!hydrated) return <SettingsFormLoading />;
  return (
    <Fields variant="form">
      <ChipRow
        label={t('settings.timeFormatLabel')}
        hint={t('settings.timeFormatHint')}
        options={TIME_FORMATS}
        selected={timeFormat}
        onSelect={(format) => void setTimeFormat(format)}
        labelFor={(format) => t(`settings.timeFormat.${format}`)}
      />
      <ChipRow
        label={t('settings.weekStartLabel')}
        hint={t('settings.weekStartHint')}
        options={CALENDAR_WEEK_START_DAYS}
        selected={weekStart}
        onSelect={(day) => void setWeekStart(day)}
        labelFor={(day) => t(`settings.weekStart.${day}`)}
      />
    </Fields>
  );
}
