import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { ExtractionRow } from '@/engine/corpTaxBook/bookView';
import { ExtractionStateFilter, ExtractionTimeline } from './ExtractionTimeline';
import { DEFAULT_STATES } from './extractionStates';

vi.mock('./useBook', () => ({
  useBook: () => ({
    view: { input: { now: '2026-10-18T12:00:00Z' } },
    names: { refinery: (id: number) => `Refinery ${id}`, moon: () => undefined },
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
    plannedFractureAt: '2026-10-17T12:00:00Z',
    plannedExpiresAt: '2026-10-25T00:00:00Z',
  }) as unknown as ExtractionRow;

describe('ExtractionTimeline', () => {
  it('draws one now line over all the rows, not one per row', () => {
    render(
      <MemoryRouter>
        <ExtractionTimeline
          rows={[row('a', 1), row('b', 2), row('c', 3)]}
          states={DEFAULT_STATES}
        />
      </MemoryRouter>
    );
    expect(screen.getAllByRole('link')).toHaveLength(3);
    expect(screen.getAllByTestId('timeline-now')).toHaveLength(1);
  });

  it('keeps the state word outside the truncating name and clamps the label only from sm up', () => {
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1)]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    const label = screen.getByText('Refinery 1').parentElement as HTMLElement;
    expect(label.className).toContain('sm:w-48');
    expect(label.className).not.toMatch(/(^|\s)w-48/);
    expect(screen.getByText('Refinery 1').className).toContain('truncate');
    expect(within(label).getByText('Ready').className).not.toContain('truncate');
  });

  it('drops a chunk that expired more than 2 days ago, and a cancelled one', () => {
    const old = { ...row('x', 9), state: 'expired' as const, expiresAt: '2026-10-15T00:00:00Z' };
    const cancelled = { ...row('y', 8), state: 'cancelled' as const };
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1), old, cancelled]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    expect(screen.getByText('Refinery 1')).toBeInTheDocument();
    expect(screen.queryByText('Refinery 9')).not.toBeInTheDocument();
    expect(screen.queryByText('Refinery 8')).not.toBeInTheDocument();
  });

  it('keeps a chunk that expired exactly 2 days ago', () => {
    const edge = { ...row('x', 9), state: 'expired' as const, expiresAt: '2026-10-16T12:00:00Z' };
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[edge]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    expect(screen.getByText('Refinery 9')).toBeInTheDocument();
  });

  it('shows Expired by default and hides it when its state is off', () => {
    const expired = {
      ...row('x', 9),
      state: 'expired' as const,
      expiresAt: '2026-10-17T00:00:00Z',
    };
    const { rerender } = render(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1), expired]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    expect(screen.getByText('Refinery 9')).toBeInTheDocument();
    rerender(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1), expired]} states={new Set(['ready'])} />
      </MemoryRouter>
    );
    expect(screen.queryByText('Refinery 9')).not.toBeInTheDocument();
  });

  it('says when the states shown hide every chunk', () => {
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1)]} states={new Set()} />
      </MemoryRouter>
    );
    expect(screen.getByText(/matches the states shown/)).toBeInTheDocument();
  });

  it('marks a Ready chunk with a green segment even when it is not fractured yet', () => {
    const waiting = { ...row('w', 4), fracturedAt: undefined, expiresAt: undefined };
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[waiting]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    expect(document.querySelector('.bg-success')?.className).toContain('min-w-1.5');
  });

  it('draws one green bar from Ready to the planned Expired for a chunk not fractured yet', () => {
    const waiting = {
      ...row('w', 4),
      fracturedAt: undefined,
      expiresAt: undefined,
      plannedExpiresAt: '2026-10-19T03:00:00Z',
    };
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[waiting]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    const bar = screen.getByRole('link');
    expect(bar.querySelectorAll('.bg-success')).toHaveLength(1);
    expect(bar.querySelectorAll('.bg-warning')).toHaveLength(0);
  });

  it('ticks an early laser fracture and no other', () => {
    const laser = { ...row('l', 5), fracturedBy: 'laser' as const };
    const { rerender } = render(
      <MemoryRouter>
        <ExtractionTimeline rows={[laser]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    expect(screen.getAllByTestId('laser-tick')).toHaveLength(1);
    rerender(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1)]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    expect(screen.queryByTestId('laser-tick')).toBeNull();
  });

  it('lists Ready, Auto-fracture and Expired in the bar tooltip on focus', async () => {
    render(
      <MemoryRouter>
        <ExtractionTimeline rows={[row('a', 1)]} states={DEFAULT_STATES} />
      </MemoryRouter>
    );
    await userEvent.tab();
    await userEvent.tab();
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Ready (chunk arrives)');
    expect(tip).toHaveTextContent('Auto-fracture');
    expect(tip).toHaveTextContent('Expired');
  });
});

describe('ExtractionStateFilter', () => {
  const expired = { ...row('x', 9), state: 'expired' as const };

  it('lists Fractured, Ready, Extracting, Expired in that order, counting every row of the state', () => {
    render(
      <ExtractionStateFilter
        rows={[row('a', 1), row('b', 2), expired]}
        states={DEFAULT_STATES}
        onToggle={() => undefined}
      />
    );
    const chips = screen.getAllByRole('button').map((b) => b.textContent);
    expect(chips).toEqual(['Fractured0', 'Ready2', 'Extracting0', 'Expired1']);
    expect(screen.getByRole('button', { name: /Expired/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers Cancelled only when the book has one', () => {
    render(
      <ExtractionStateFilter
        rows={[{ ...row('c', 3), state: 'cancelled' as const }]}
        states={DEFAULT_STATES}
        onToggle={() => undefined}
      />
    );
    expect(screen.getByRole('button', { name: /Cancelled/ })).toBeInTheDocument();
  });

  it('reports the toggled state', async () => {
    const onToggle = vi.fn();
    render(
      <ExtractionStateFilter rows={[row('a', 1)]} states={DEFAULT_STATES} onToggle={onToggle} />
    );
    await userEvent.click(screen.getByRole('button', { name: /Expired/ }));
    expect(onToggle).toHaveBeenCalledWith('expired');
  });
});
