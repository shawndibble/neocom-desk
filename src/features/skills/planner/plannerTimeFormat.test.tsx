import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { QueueEndProjection } from '@/engine/skills/queueStatus';
import { DEFAULT_TIME_FORMAT, useTimeFormat } from '@/lib/timeFormat';
import { LiveQueueLead } from './LiveQueueLead';
import { QueueStrip } from './QueueStrip';
import type { QueueView } from './queueView';
import { doneByText } from './doneBy';
import { yearlyRemapAfterNote } from './optimizeHelpers';
import i18n from '@/i18n';

// 02:00Z is the evening of the 9th in Los Angeles but already the 10th on the EVE clock.
const INSTANT = '2026-10-10T02:00:00Z';
const originalTz = process.env.TZ;

beforeEach(() => {
  process.env.TZ = 'America/Los_Angeles';
});
afterEach(() => {
  useTimeFormat.setState({ value: DEFAULT_TIME_FORMAT, hydrated: false });
});
afterAll(() => {
  process.env.TZ = originalTz;
});

const projection: QueueEndProjection = {
  startMs: Date.parse(INSTANT),
  trained: new Map(),
  queuedLevels: [{ skill_id: 3300, queue_position: 0, finished_level: 3, finish_date: INSTANT }],
  paused: false,
};

function renderLead() {
  return render(
    <MemoryRouter>
      <LiveQueueLead projection={projection} fetchedAt={null} nameFor={() => 'Gunnery'} />
    </MemoryRouter>
  );
}

describe('Skills planner dates follow the Time format setting', () => {
  it('LiveQueueLead shows the local day by default and the UTC day on the EVE clock', () => {
    renderLead();
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getAllByText(/2026-10-09/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026-10-10/)).toBeNull();

    act(() => useTimeFormat.setState({ value: 'eve', hydrated: true }));
    expect(screen.getAllByText(/2026-10-10/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2026-10-09/)).toBeNull();
  });

  it('QueueStrip finish date moves with the setting', () => {
    const view = {
      totalSeconds: 3600,
      skillCount: 1,
      hero: null,
      groups: [],
      finished: [],
      undated: [],
    } as QueueView;
    const { container } = render(<QueueStrip view={view} nowMs={Date.parse(INSTANT)} />);
    expect(container.textContent).toContain('2026-10-09');
    act(() => useTimeFormat.setState({ value: 'eve', hydrated: true }));
    expect(container.textContent).toContain('2026-10-10');
  });

  it('pure helpers take the zone as an argument', () => {
    const start = new Date(INSTANT);
    expect(doneByText(0, start)).toBe('2026-10-09');
    expect(doneByText(0, start, 'UTC')).toBe('2026-10-10');
    expect(yearlyRemapAfterNote(i18n.t, start)).toContain('2026-10-09');
    expect(yearlyRemapAfterNote(i18n.t, start, 'UTC')).toContain('2026-10-10');
  });
});
