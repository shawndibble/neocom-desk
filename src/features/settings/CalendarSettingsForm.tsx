import { useTranslation } from 'react-i18next';
import { Fields } from '@/components/ui';
import {
  CALENDAR_WEEK_START_DAYS,
  useCalendarWeekStart,
} from '@/features/character/calendarWeekStart';
import {
  SHARED_POP_TIME_CHOICES,
  useSharedPopTime,
} from '@/features/character/calendarSharedPopTime';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { TIME_FORMATS, useTimeFormat } from '@/lib/timeFormat';
import { SegmentedRow, SettingsFormLoading } from './settingsFields';

export function CalendarSettingsForm() {
  const { t } = useTranslation();
  const timeFormat = useTimeFormat((state) => state.value);
  const setTimeFormat = useTimeFormat((state) => state.setValue);
  const weekStart = useCalendarWeekStart((state) => state.value);
  const setWeekStart = useCalendarWeekStart((state) => state.setValue);
  const sharedPopTime = useSharedPopTime((state) => state.value);
  const setSharedPopTime = useSharedPopTime((state) => state.setValue);
  const hydrated = useHydratedStore(useCalendarWeekStart, useSharedPopTime);
  if (!hydrated) return <SettingsFormLoading />;
  return (
    <Fields variant="form">
      <SegmentedRow
        label={t('settings.timeFormatLabel')}
        hint={t('settings.timeFormatHint')}
        options={TIME_FORMATS}
        selected={timeFormat}
        onSelect={(format) => void setTimeFormat(format)}
        labelFor={(format) => t(`settings.timeFormat.${format}`)}
      />
      <SegmentedRow
        label={t('settings.weekStartLabel')}
        hint={t('settings.weekStartHint')}
        options={CALENDAR_WEEK_START_DAYS}
        selected={weekStart}
        onSelect={(day) => void setWeekStart(day)}
        labelFor={(day) => t(`settings.weekStart.${day}`)}
      />
      <SegmentedRow
        label={t('settings.sharedPopTimeLabel')}
        hint={t('settings.sharedPopTimeHint')}
        options={SHARED_POP_TIME_CHOICES}
        selected={sharedPopTime}
        onSelect={(choice) => void setSharedPopTime(choice)}
        labelFor={(choice) => t(`settings.sharedPopTime.${choice}`)}
      />
    </Fields>
  );
}
