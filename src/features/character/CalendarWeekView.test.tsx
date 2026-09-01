import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CalendarWeekView } from './CalendarWeekView';
import type { CalendarEventSummary } from '@/esi/endpoints';

// 2026-09-03 is a Thursday in the Mon 2026-08-31 .. Sun 2026-09-06 week.
const WEEK_ANCHOR = new Date(2026, 8, 3);

const EVENTS: CalendarEventSummary[] = [
  {
    event_id: 1,
    event_date: '2026-09-01T18:00:00',
    title: 'Fleet Op',
    importance: 1,
    event_response: 'accepted',
  },
  {
    event_id: 2,
    event_date: '2026-09-10T12:00:00', // outside the visible week
    title: 'Out Of Range',
    importance: 1,
    event_response: 'declined',
  },
];

describe('CalendarWeekView', () => {
  it('renders only events that fall within the visible week', () => {
    render(<CalendarWeekView weekAnchor={WEEK_ANCHOR} events={EVENTS} onSelectEvent={() => {}} />);
    expect(screen.getByText(/Fleet Op/)).toBeInTheDocument();
    expect(screen.queryByText(/Out Of Range/)).not.toBeInTheDocument();
  });

  it('calls onSelectEvent with the clicked event', async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    render(
      <CalendarWeekView weekAnchor={WEEK_ANCHOR} events={EVENTS} onSelectEvent={onSelectEvent} />
    );
    await user.click(screen.getByText(/Fleet Op/));
    expect(onSelectEvent).toHaveBeenCalledWith(EVENTS[0]);
  });
});
