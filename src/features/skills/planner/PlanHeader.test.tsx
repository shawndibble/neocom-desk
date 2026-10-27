import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
    // StatChip is a fixed height, so the chips ahead of the scroll got
    // squeezed until their labels broke over two lines inside a one-line
    // row.
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

describe('PlanHeader what-if chip', () => {
  const base = {
    totalSeconds: 3600,
    skillCount: 2,
    projectedFinish: null,
    badge: null,
    nextMilestone: null,
  };

  it('sits in the stat strip, naming the lens and its gain', () => {
    render(
      <PlanHeader {...base} whatIf={{ lens: '+5', verdict: { kind: 'saves', seconds: 7200 } }} />
    );
    const chip = screen.getByTestId('what-if-chip');
    expect(chip).toHaveTextContent(/^What-if \+5Saves .+ vs current$/);
  });

  it('reads same as current with no difference', () => {
    render(
      <PlanHeader {...base} whatIf={{ lens: 'None', verdict: { kind: 'same', seconds: 0 } }} />
    );
    expect(screen.getByTestId('what-if-chip')).toHaveTextContent('What-if NoneSame as current');
  });

  it('is absent on the real implants', () => {
    render(<PlanHeader {...base} whatIf={null} />);
    expect(screen.queryByTestId('what-if-chip')).not.toBeInTheDocument();
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
  it('shows the trained percentage', () => {
    render(<PlanHeader {...base} progress={progress} />);
    expect(screen.getByText('Trained')).toBeInTheDocument();
    expect(screen.getByText(/25%/)).toBeInTheDocument();
  });

  it('reads — while trained data is unknown', () => {
    render(
      <PlanHeader
        {...base}
        projectedFinish={new Date('2026-09-02T12:00:00Z')}
        progress={progress}
        trainedKnown={false}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.queryByText(/25%/)).not.toBeInTheDocument();
  });

  it('shows no progress chips for an empty plan', () => {
    render(<PlanHeader {...base} progress={{ trainedSp: 0, totalSp: 0, fraction: null }} />);
    expect(screen.queryByText('Trained')).not.toBeInTheDocument();
  });

  it('reads 100% when fully trained', () => {
    render(<PlanHeader {...base} progress={{ trainedSp: 10, totalSp: 10, fraction: 1 }} />);
    expect(screen.getByText(/100%/)).toBeInTheDocument();
  });

  describe('plan name (#1709)', () => {
    const named = {
      totalSeconds: 0,
      skillCount: 0,
      projectedFinish: null,
      badge: null,
      nextMilestone: null,
    };

    it('shows the plan name as an editable field instead of the generic title', () => {
      render(<PlanHeader {...named} name="Titan pilot" onRename={() => {}} />);
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveValue('Titan pilot');
      expect(screen.queryByText('Plan summary')).not.toBeInTheDocument();
    });

    it('commits a trimmed rename on blur', () => {
      const onRename = vi.fn();
      render(<PlanHeader {...named} name="Titan pilot" onRename={onRename} />);
      const input = screen.getByRole('textbox', { name: 'Plan name' });
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '  Dread pilot ' } });
      fireEvent.blur(input);
      expect(onRename).toHaveBeenCalledWith('Dread pilot');
    });

    it('reverts an emptied name instead of saving it', () => {
      const onRename = vi.fn();
      render(<PlanHeader {...named} name="Titan pilot" onRename={onRename} />);
      const input = screen.getByRole('textbox', { name: 'Plan name' });
      fireEvent.focus(input);
      fireEvent.change(input, { target: { value: '  ' } });
      fireEvent.blur(input);
      expect(onRename).not.toHaveBeenCalled();
      expect(input).toHaveValue('Titan pilot');
    });

    it('focuses the field when arriving from New plan', () => {
      render(<PlanHeader {...named} name="Untitled" onRename={() => {}} focusName />);
      expect(screen.getByRole('textbox', { name: 'Plan name' })).toHaveFocus();
    });
  });

  describe('savings shrank with implants', () => {
    const badge = {
      savingsSeconds: 13 * 86400,
      evaluatedRemapCount: 1,
      requestedRemapCount: 1,
      capped: false,
    };
    const header = (shrank: boolean) => (
      <PlanHeader
        totalSeconds={0}
        skillCount={1}
        projectedFinish={null}
        badge={badge}
        nextMilestone={null}
        savingsShrankWithImplants={shrank}
      />
    );

    it('explains the smaller saving in a tooltip on the savings chip', () => {
      render(header(true));
      expect(screen.getByRole('button', { name: /remap savings/i })).toHaveTextContent('i');
    });

    it('shows no tooltip trigger otherwise', () => {
      render(header(false));
      expect(screen.queryByRole('button', { name: /remap savings/i })).not.toBeInTheDocument();
    });
  });
});
