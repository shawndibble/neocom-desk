import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import { useTimeFormat } from '@/lib/timeFormat';
import { CalendarSettingsForm } from './CalendarSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useCalendarWeekStart.setState({ value: 'monday', hydrated: false });
});

describe('CalendarSettingsForm', () => {
  it('writes the week start to the shared store', async () => {
    const user = userEvent.setup();
    render(<CalendarSettingsForm />);
    await user.click(await screen.findByRole('button', { name: 'Sunday' }));
    expect(useCalendarWeekStart.getState().value).toBe('sunday');
  });

  it('writes the time format to the shared store', async () => {
    const user = userEvent.setup();
    render(<CalendarSettingsForm />);
    await screen.findByText(/week starts on/i);
    const before = useTimeFormat.getState().value;
    const other = screen
      .getAllByRole('button')
      .find((button) => button.getAttribute('aria-pressed') === 'false');
    await user.click(other!);
    expect(useTimeFormat.getState().value).not.toBe(before);
  });
});
