import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { LiveQueueLead } from './LiveQueueLead';
import type { QueueEndProjection } from '../queueStatus';

const projection: QueueEndProjection = {
  startMs: Date.parse('2026-10-10T00:00:00Z'),
  trained: new Map(),
  queuedLevels: [
    { skill_id: 3300, queue_position: 0, finished_level: 3, finish_date: '2026-10-09T12:00:00Z' },
  ],
  paused: false,
};

describe('LiveQueueLead', () => {
  it('lists each queued skill name as a link to its Skill detail (#3249)', () => {
    render(
      <MemoryRouter initialEntries={['/skills']}>
        <LiveQueueLead projection={projection} fetchedAt={null} nameFor={() => 'Gunnery'} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('link', { name: 'Gunnery' })).toHaveAttribute(
      'href',
      '/skills?info=skill-3300'
    );
  });
});
