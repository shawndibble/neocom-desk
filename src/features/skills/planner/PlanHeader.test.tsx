import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { PlanHeader } from './PlanHeader';

describe('PlanHeader', () => {
  it('shows total training time, skill count, and projected finish', () => {
    render(
      <PlanHeader
        totalSeconds={3661}
        skillCount={4}
        projectedFinish={new Date('2026-09-01T00:00:00Z')}
        badge={null}
      />
    );

    expect(screen.getByText('1h 1m')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('pins itself at a plain top-0, with no offset measured off a neighbouring panel', () => {
    render(<PlanHeader totalSeconds={0} skillCount={0} projectedFinish={null} badge={null} />);

    // It stays pinned because the window can still scroll when the sidebar
    // outgrows the viewport. What retires #221/#229 is that it is now the
    // only pinned panel, so `top` is a static class rather than a number
    // measured off the panel above it and kept in sync.
    const section = screen.getByRole('heading', { name: 'Plan summary' }).closest('section');
    expect(section).toHaveClass('lg:sticky', 'lg:top-0');
    expect(section?.getAttribute('style') ?? '').not.toMatch(/top/);
  });

  it('shows an empty finish rather than inventing a date for an empty plan', () => {
    render(<PlanHeader totalSeconds={0} skillCount={0} projectedFinish={null} badge={null} />);

    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('reports real savings when the badge is within the evaluated cap', () => {
    render(
      <PlanHeader
        totalSeconds={1000}
        skillCount={2}
        projectedFinish={null}
        badge={{
          savingsSeconds: 500,
          evaluatedRemapCount: 2,
          requestedRemapCount: 2,
          capped: false,
        }}
      />
    );

    expect(screen.getByText('8m')).toBeInTheDocument();
    expect(screen.queryByText(/evaluated with/i)).not.toBeInTheDocument();
  });

  it('states the cap instead of implying the answer is complete when the plan asks for more', () => {
    render(
      <PlanHeader
        totalSeconds={1000}
        skillCount={2}
        projectedFinish={null}
        badge={{
          savingsSeconds: 500,
          evaluatedRemapCount: 2,
          requestedRemapCount: 5,
          capped: true,
        }}
      />
    );

    expect(screen.getByText('8m')).toBeInTheDocument();
    expect(screen.getByText(/evaluated with 2 remaps/i)).toBeInTheDocument();
  });

  it('never shows a saving below the meaningful-savings threshold', () => {
    render(
      <PlanHeader
        totalSeconds={1000}
        skillCount={2}
        projectedFinish={null}
        badge={{
          savingsSeconds: 30,
          evaluatedRemapCount: 1,
          requestedRemapCount: 1,
          capped: false,
        }}
      />
    );

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('does not mention a booster when none is assumed', () => {
    render(<PlanHeader totalSeconds={1000} skillCount={2} projectedFinish={null} badge={null} />);

    expect(screen.queryByText(/booster/i)).not.toBeInTheDocument();
  });

  it('discloses on the total itself that the estimate assumes a hypothetical booster', () => {
    // The bug report compared this total against the in-game queue and found
    // it 32% fast. It was: the user had a +12 accelerator ticked in the
    // What-if panel. The per-row BoosterMark said so per skill, but the one
    // number they actually compared said nothing at all.
    render(
      <PlanHeader
        totalSeconds={1000}
        skillCount={2}
        projectedFinish={null}
        badge={null}
        booster={{ bonus: 12, expiresAt: new Date('2026-09-15T21:00:00Z') }}
      />
    );

    expect(screen.getByText(/\+12/)).toBeInTheDocument();
    expect(screen.getByText(/booster/i)).toBeInTheDocument();
  });

  it('wraps whole chips onto a second line rather than crushing them into one', () => {
    // Reported with a Booster on: five chips is more than the strip fits
    // beside the sidebar, and it used to answer that by refusing to wrap
    // (`lg:flex-nowrap`) and scrolling sideways instead. StatChip is a
    // fixed-height box, so the chips ahead of the scroll got squeezed until
    // their labels broke over two lines inside a one-line-tall border.
    render(
      <PlanHeader
        totalSeconds={1000}
        skillCount={2}
        projectedFinish={new Date('2026-09-01T00:00:00Z')}
        badge={{
          savingsSeconds: 500,
          evaluatedRemapCount: 2,
          requestedRemapCount: 2,
          capped: false,
        }}
        booster={{ bonus: 12, expiresAt: new Date('2026-09-15T21:00:00Z') }}
      />
    );

    const strip = screen.getByText('16m').closest('div');
    expect(strip).toHaveClass('flex-wrap');
    // A hidden sideways scroller would put stats off-screen with nothing to
    // suggest going looking for them.
    expect(strip).not.toHaveClass('lg:flex-nowrap');
    expect(strip).not.toHaveClass('lg:overflow-x-auto');
  });
});
