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

  it('pins the summary strip flush to the top of the scroll box on lg+, alongside the toolbar below it', () => {
    render(<PlanHeader totalSeconds={0} skillCount={0} projectedFinish={null} badge={null} />);

    const section = screen.getByRole('heading', { name: 'Plan summary' }).closest('section');
    expect(section).toHaveClass('lg:sticky', 'lg:top-0');
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
