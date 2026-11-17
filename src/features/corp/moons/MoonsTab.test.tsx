import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { MoonPage } from './MoonPage';
import { MoonsTab } from './MoonsTab';

const ex = (id: string, moonId: number, state: string, startedAt: string) => ({
  id,
  state,
  structureId: 1,
  moonId,
  startedAt,
  chunkArrivalAt: startedAt,
  plannedFractureAt: startedAt,
  plannedExpiresAt: startedAt,
  oreSource: 'unknown',
  oreLines: [],
  estimatedValue: null,
  minedPct: null,
  tax: 0,
  minerCount: 0,
});
vi.mock('./useBook', () => ({
  useBook: () => ({
    corporationId: 98000001,
    canEdit: false,
    view: {
      input: { rates: [] },
      extractions: [
        ex('a', 10, 'fractured', '2026-09-01T00:00:00Z'),
        ex('b', 10, 'expired', '2026-08-01T00:00:00Z'),
        ex('c', 11, 'extracting', '2026-10-01T00:00:00Z'),
      ],
    },
    names: {
      refinery: () => 'Station',
      moon: (id: number) => `Moon ${id}`,
      ore: () => 'Ore',
      corporation: () => 'Corp',
    },
  }),
}));

describe('MoonsTab', () => {
  it('lists one row per moon, each name a link to its page', () => {
    render(
      <MemoryRouter>
        <MoonsTab />
      </MemoryRouter>
    );
    expect(screen.getByRole('link', { name: 'Moon 10' }).getAttribute('href')).toBe(
      '/corp/moons/moons/10'
    );
    expect(screen.getByRole('link', { name: 'Moon 11' })).toBeTruthy();
  });
});

describe('MoonPage', () => {
  it("shows the moon's past and present Extractions, each opening its page", () => {
    render(
      <MemoryRouter>
        <MoonPage moonId={10} />
      </MemoryRouter>
    );
    expect(screen.getAllByText('Fractured').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Expired').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Extracting')).toHaveLength(0);
  });

  it('says so when the moon has no Extractions', () => {
    render(
      <MemoryRouter>
        <MoonPage moonId={99} />
      </MemoryRouter>
    );
    expect(screen.getByText(/no Extractions in the book/)).toBeTruthy();
  });
});
