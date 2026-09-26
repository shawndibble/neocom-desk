import { describe, it, expect, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/i18n';
import { formatLocalDate } from '@/lib/localDate';
import { PlanHeader } from './PlanHeader';

describe('PlanHeader', () => {
  describe('projected finish renders in the viewer local timezone (#207)', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it('renders the previous local day for an instant just after UTC midnight', () => {
      process.env.TZ = 'America/Los_Angeles';
      render(
        <PlanHeader
          totalSeconds={0}
          skillCount={0}
          projectedFinish={new Date('2026-09-01T00:00:00Z')}
          badge={null}
          nextMilestone={null}
        />
      );

      expect(screen.getByText('2026-08-31')).toBeInTheDocument();
    });
  });

  it('shows total training time, skill count, and projected finish', () => {
    render(
      <PlanHeader
        totalSeconds={3661}
        skillCount={4}
        projectedFinish={new Date('2026-09-01T00:00:00Z')}
        badge={null}
        nextMilestone={null}
      />
    );

    expect(screen.getByText('1h 1m')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('pins itself at a plain top-0, with no offset measured off a neighbouring panel', () => {
    render(
      <PlanHeader
        totalSeconds={0}
        skillCount={0}
        projectedFinish={null}
        badge={null}
        nextMilestone={null}
      />
    );

    // It stays pinned because the window can still scroll when the sidebar
    // outgrows the viewport. What retires #221/#229 is that it is now the
    // only pinned panel, so `top` is a static class rather than a number
    // measured off the panel above it and kept in sync.
    const section = screen.getByRole('heading', { name: 'Plan summary' }).closest('section');
    expect(section).toHaveClass('lg:sticky', 'lg:top-0');
    expect(section?.getAttribute('style') ?? '').not.toMatch(/top/);
  });

  it('shows an empty finish rather than inventing a date for an empty plan', () => {
    render(
      <PlanHeader
        totalSeconds={0}
        skillCount={0}
        projectedFinish={null}
        badge={null}
        nextMilestone={null}
      />
    );

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
        nextMilestone={null}
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
        nextMilestone={null}
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
        nextMilestone={null}
      />
    );

    expect(screen.getByText('None')).toBeInTheDocument();
  });

  it('wraps whole chips onto a second line rather than crushing them into one', () => {
    // Reported with all chips present: four chips is more than the strip
    // fits beside the sidebar at some widths, and it used to answer that by
    // refusing to wrap (`lg:flex-nowrap`) and scrolling sideways instead.
    // StatChip is a fixed-height box, so the chips ahead of the scroll got
    // squeezed until their labels broke over two lines inside a
    // one-line-tall border.
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
        nextMilestone={null}
      />
    );

    const strip = screen.getByText('16m').closest('div');
    expect(strip).toHaveClass('flex-wrap');
    // A hidden sideways scroller would put stats off-screen with nothing to
    // suggest going looking for them.
    expect(strip).not.toHaveClass('lg:flex-nowrap');
    expect(strip).not.toHaveClass('lg:overflow-x-auto');
  });

  it('shows the next Plan Milestone, name and date', () => {
    const finish = new Date('2026-09-01T00:00:00Z');
    render(
      <PlanHeader
        totalSeconds={0}
        skillCount={0}
        projectedFinish={null}
        badge={null}
        nextMilestone={{ name: 'Fly Loki', finish }}
      />
    );

    expect(screen.getByText('Fly Loki')).toBeInTheDocument();
    expect(screen.getByText(formatLocalDate(finish))).toBeInTheDocument();
  });

  it('shows no milestone chip once none is left ahead', () => {
    render(
      <PlanHeader
        totalSeconds={0}
        skillCount={0}
        projectedFinish={null}
        badge={null}
        nextMilestone={null}
      />
    );

    expect(screen.queryByText('Fly Loki')).not.toBeInTheDocument();
  });
});

describe('PlanHeader progress chips (#1409)', () => {
  const base = {
    totalSeconds: 3600,
    skillCount: 2,
    projectedFinish: null,
    badge: null,
    nextMilestone: null,
  };
  const progress = { trainedSp: 500_000, totalSp: 2_000_000, fraction: 0.25 };
  const nextStep = {
    name: 'Gunnery',
    level: 3,
    cumulativeSeconds: 0,
    startDate: new Date('2026-09-01T12:00:00Z'),
  };

  it('shows the trained percentage and the next step', () => {
    render(<PlanHeader {...base} progress={progress} nextStep={nextStep} />);
    expect(screen.getByText('Trained')).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
    expect(screen.getByText('Next step')).toBeInTheDocument();
    expect(screen.getByText(/Gunnery III/)).toBeInTheDocument();
  });

  it('reads — while trained data is unknown', () => {
    render(
      <PlanHeader
        {...base}
        projectedFinish={new Date('2026-09-02T12:00:00Z')}
        progress={progress}
        nextStep={nextStep}
        trainedKnown={false}
      />
    );
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.queryByText(/25%/)).not.toBeInTheDocument();
  });

  it('shows no progress chips for an empty plan', () => {
    render(
      <PlanHeader
        {...base}
        progress={{ trainedSp: 0, totalSp: 0, fraction: null }}
        nextStep={null}
      />
    );
    expect(screen.queryByText('Trained')).not.toBeInTheDocument();
    expect(screen.queryByText('Next step')).not.toBeInTheDocument();
  });

  it('reads 100% and nothing left when fully trained', () => {
    render(
      <PlanHeader
        {...base}
        progress={{ trainedSp: 10, totalSp: 10, fraction: 1 }}
        nextStep={null}
      />
    );
    expect(screen.getByText(/100%/)).toBeInTheDocument();
    expect(screen.getByText('Nothing left to train')).toBeInTheDocument();
  });

  describe('plan name (#1709)', () => {
    it('shows the plan name as the panel title instead of the generic one', () => {
      render(
        <PlanHeader
          totalSeconds={0}
          skillCount={0}
          projectedFinish={null}
          badge={null}
          nextMilestone={null}
          name="Titan pilot"
        />
      );
      expect(screen.getByText('Titan pilot')).toBeInTheDocument();
      expect(screen.queryByText('Plan summary')).not.toBeInTheDocument();
      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });
  });
});
