import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { ExtractionTimeline } from './ExtractionTimeline';

vi.mock('./useBook', () => ({
  useBook: () => ({
    view: { input: { now: '2026-10-18T12:00:00Z' } },
    names: { refinery: (id: number) => `Refinery ${id}` },
  }),
}));

const row = (id: string, structureId: number): ExtractionRow =>
  ({
    id,
    structureId,
    state: 'ready',
    startedAt: '2026-10-10T00:00:00Z',
    chunkArrivalAt: '2026-10-17T00:00:00Z',
    fracturedAt: '2026-10-17T12:00:00Z',
    expiresAt: '2026-10-25T00:00:00Z',
  }) as unknown as ExtractionRow;

describe('ExtractionTimeline', () => {
  it('draws one now line over all the rows, not one per row', () => {
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1), row('b', 2), row('c', 3)]} />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getAllByTestId('timeline-now')).toHaveLength(1);
  });
});
