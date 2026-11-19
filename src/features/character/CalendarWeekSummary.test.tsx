import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import type { CharacterBoardItem } from '@/engine/character/board';
import { DAY_MS } from '@/lib/age';
import { CalendarWeekSummary } from './CalendarWeekSummary';

const NOW = 1_000_000;
const item = (id: string, inMs: number): CharacterBoardItem => ({
  id: `sharedMoonPop:${id}`,
  sourceId: id,
  kind: 'sharedMoonPop',
  subject: id,
  detail: '',
  deadlineMs: NOW + inMs,
  remainingMs: inMs,
  response: null,
  important: false,
});

describe('CalendarWeekSummary', () => {
  it('counts only items due in the next 7 days', () => {
    render(
      <CalendarWeekSummary
        items={[item('a', DAY_MS), item('b', 2 * DAY_MS), item('c', 9 * DAY_MS)]}
        nowMs={NOW}
      />
    );
    expect(screen.getByText('Next 7 days')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('renders nothing on a quiet week', () => {
    const { container } = render(
      <CalendarWeekSummary items={[item('c', 9 * DAY_MS)]} nowMs={NOW} />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
