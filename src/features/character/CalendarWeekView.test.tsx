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
    render(
      <CalendarWeekView
        weekAnchor={WEEK_ANCHOR}
        events={EVENTS}
        onSelectEvent={() => {}}
        onAddToMonthView={() => {}}
      />
    );
    expect(screen.getByText(/Fleet Op/)).toBeInTheDocument();
    expect(screen.queryByText(/Out Of Range/)).not.toBeInTheDocument();
  });

  it('calls onSelectEvent with the clicked event', async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    render(
      <CalendarWeekView
        weekAnchor={WEEK_ANCHOR}
        events={EVENTS}
        onSelectEvent={onSelectEvent}
        onAddToMonthView={() => {}}
      />
    );
    await user.click(screen.getByText(/Fleet Op/));
    expect(onSelectEvent).toHaveBeenCalledWith(EVENTS[0]);
  });

  it('offers "Add to Month view" on an event\'s context menu, with the event\'s date', async () => {
    const user = userEvent.setup();
    const onAddToMonthView = vi.fn();
    render(
      <CalendarWeekView
        weekAnchor={WEEK_ANCHOR}
        events={EVENTS}
        onSelectEvent={() => {}}
        onAddToMonthView={onAddToMonthView}
      />
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText(/Fleet Op/) });
    await user.click(await screen.findByText('Add to Month view'));
    expect(onAddToMonthView).toHaveBeenCalledTimes(1);
    const date = onAddToMonthView.mock.calls[0][0] as Date;
    expect(date.getDate()).toBe(1);
    expect(date.getMonth()).toBe(8);
  });

  it('shows "no events this week" when the visible week has none', () => {
    render(
      <CalendarWeekView
        weekAnchor={new Date(2026, 8, 20)} // a week with no matching events
        events={EVENTS}
        onSelectEvent={() => {}}
        onAddToMonthView={() => {}}
      />
    );
    expect(screen.getByText('No events this week.')).toBeInTheDocument();
  });
});
