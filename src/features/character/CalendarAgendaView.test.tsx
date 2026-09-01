import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { CalendarAgendaView } from './CalendarAgendaView';
import type { CalendarEventSummary } from '@/esi/endpoints';

const EVENTS: CalendarEventSummary[] = [
  {
    event_id: 1,
    event_date: '2026-09-01T18:00:00Z',
    title: 'Fleet Op',
    importance: 1,
    event_response: 'accepted',
  },
  {
    event_id: 2,
    event_date: '2026-09-02T12:00:00Z',
    title: 'CTA',
    importance: 2,
    event_response: 'declined',
  },
];

describe('CalendarAgendaView', () => {
  it('renders one row per event with title and response', () => {
    render(<CalendarAgendaView events={EVENTS} onSelectEvent={() => {}} />);
    expect(screen.getByText('Fleet Op')).toBeInTheDocument();
    expect(screen.getByText('Accepted')).toBeInTheDocument();
    expect(screen.getByText('CTA')).toBeInTheDocument();
    expect(screen.getByText('Declined')).toBeInTheDocument();
  });

  it('calls onSelectEvent with the clicked event', async () => {
    const user = userEvent.setup();
    const onSelectEvent = vi.fn();
    render(<CalendarAgendaView events={EVENTS} onSelectEvent={onSelectEvent} />);
    await user.click(screen.getByText('Fleet Op'));
    expect(onSelectEvent).toHaveBeenCalledWith(EVENTS[0]);
  });
});
