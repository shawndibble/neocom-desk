import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CalendarMonthView } from './CalendarMonthView';
import type { CalendarEventSummary } from '@/esi/endpoints';

const MONTH_ANCHOR = new Date(2026, 8, 1); // September 2026

function eventOn(id: number, isoLocal: string, title: string): CalendarEventSummary {
  return {
    event_id: id,
    event_date: isoLocal,
    title,
    importance: 1,
    event_response: 'accepted',
  };
}

describe('CalendarMonthView', () => {
  it('renders an event chip on its day and calls onSelectEvent when clicked', async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    const event = eventOn(1, '2026-09-15T18:00:00', 'Fleet Op');
    render(
      <CalendarMonthView
        monthAnchor={MONTH_ANCHOR}
        events={[event]}
        onSelectEvent={onSelectEvent}
        onExpandDay={() => {}}
      />
    );
    await user.click(screen.getByText('Fleet Op'));
    expect(onSelectEvent).toHaveBeenCalledWith(event);
  });

  it('caps a day at 3 chips and shows a "+N more" affordance beyond that', async () => {
    const user = userEvent.setup();
    const onExpandDay = vi.fn();
    const events = [
      eventOn(1, '2026-09-15T09:00:00', 'One'),
      eventOn(2, '2026-09-15T10:00:00', 'Two'),
      eventOn(3, '2026-09-15T11:00:00', 'Three'),
      eventOn(4, '2026-09-15T12:00:00', 'Four'),
      eventOn(5, '2026-09-15T13:00:00', 'Five'),
    ];
    render(
      <CalendarMonthView
        monthAnchor={MONTH_ANCHOR}
        events={events}
        onSelectEvent={() => {}}
        onExpandDay={onExpandDay}
      />
    );
    expect(screen.getByText('One')).toBeInTheDocument();
    expect(screen.getByText('Two')).toBeInTheDocument();
    expect(screen.getByText('Three')).toBeInTheDocument();
    expect(screen.queryByText('Four')).not.toBeInTheDocument();
    const more = screen.getByText('+2 more');
    await user.click(more);
    expect(onExpandDay).toHaveBeenCalledTimes(1);
    const calledWith = onExpandDay.mock.calls[0][0] as Date;
    expect(calledWith.getDate()).toBe(15);
    expect(calledWith.getMonth()).toBe(8);
  });

  it('does not render events outside the visible month grid', () => {
    const event = eventOn(1, '2026-11-01T09:00:00', 'Far Future');
    render(
      <CalendarMonthView
        monthAnchor={MONTH_ANCHOR}
        events={[event]}
        onSelectEvent={() => {}}
        onExpandDay={() => {}}
      />
    );
    expect(screen.queryByText('Far Future')).not.toBeInTheDocument();
  });
});
