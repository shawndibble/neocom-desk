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
});
