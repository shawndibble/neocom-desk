import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { db } from '@/db';
import { useCalendarWeekStart } from '@/features/character/calendarWeekStart';
import { useSharedPopTime } from '@/features/character/calendarSharedPopTime';
import { useTimeFormat } from '@/lib/timeFormat';
import { CalendarSettingsForm } from './CalendarSettingsForm';

beforeEach(async () => {
  await db.settings.clear();
  useCalendarWeekStart.setState({ value: 'monday', hydrated: false });
  useSharedPopTime.setState({ value: 'asShared', hydrated: false });
});

describe('CalendarSettingsForm', () => {
  it('writes the week start to the shared store', async () => {
    const user = userEvent.setup();
    render(<CalendarSettingsForm />);
    await user.click(await screen.findByRole('button', { name: 'Sunday' }));
    expect(useCalendarWeekStart.getState().value).toBe('sunday');
  });

  it('lets the pilot pick which Pop Time a shared moon pop shows at', async () => {
    const user = userEvent.setup();
    render(<CalendarSettingsForm />);
    expect(await screen.findByText('Shared moon pop time')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'As shared' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    await user.click(screen.getByRole('button', { name: 'Auto-fracture' }));
    expect(useSharedPopTime.getState().value).toBe('autoFracture');
    await user.click(screen.getByRole('button', { name: 'Ready' }));
    expect(useSharedPopTime.getState().value).toBe('ready');
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
