import { describe, it, expect, vi } from 'vitest';
import '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { formatDuration } from '@/lib/duration';
import { PlanRunsControl } from './PlanRunsControl';

const base = { runs: 10, onRunsChange: () => {}, seconds: 3_600, profit: -500 };

describe('PlanRunsControl', () => {
  it('offers Break Even only when the page passes a search', () => {
    const { rerender } = render(<PlanRunsControl {...base} findBreakEven={null} />);
    expect(screen.queryByRole('button', { name: 'Min. runs' })).toBeNull();

    rerender(<PlanRunsControl {...base} findBreakEven={() => 12} />);
    expect(screen.getByRole('button', { name: 'Min. runs' })).toBeVisible();
  });

  it('says so when no run count breaks even, until the profit moves', async () => {
    const user = userEvent.setup();
    const findBreakEven = vi.fn(() => null);
    const { rerender } = render(<PlanRunsControl {...base} findBreakEven={findBreakEven} />);

    await user.click(screen.getByRole('button', { name: 'Min. runs' }));
    expect(findBreakEven).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      /^No break even found up to [\d,]+ runs\.$/
    );

    rerender(<PlanRunsControl {...base} profit={-400} findBreakEven={findBreakEven} />);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('shows the plan time without prices, and none before the plan resolves', () => {
    const { rerender } = render(<PlanRunsControl {...base} findBreakEven={null} />);
    expect(screen.getByText(formatDuration(3_600))).toBeVisible();

    rerender(<PlanRunsControl {...base} seconds={null} findBreakEven={null} />);
    expect(screen.queryByText(formatDuration(3_600))).toBeNull();
  });

  describe('stock runs', () => {
    it('says what stock covers, names the limit and sets the runs', async () => {
      const user = userEvent.setup();
      const onRunsChange = vi.fn();
      render(
        <PlanRunsControl
          {...base}
          onRunsChange={onRunsChange}
          findBreakEven={null}
          stockRuns={{ runs: 12, limitingName: 'Pyerite' }}
        />
      );
      expect(screen.getByText(/Stock covers 12 runs\. Limited by Pyerite\./)).toBeVisible();
      await user.click(screen.getByRole('button', { name: 'Set to 12' }));
      expect(onRunsChange).toHaveBeenCalledWith(12);
    });

    it('names the limiting material with no button when stock covers none', () => {
      render(
        <PlanRunsControl
          {...base}
          findBreakEven={null}
          stockRuns={{ runs: 0, limitingName: 'Pyerite' }}
        />
      );
      expect(screen.getByText(/Stock covers no runs\. Limited by Pyerite\./)).toBeVisible();
      expect(screen.queryByRole('button', { name: /^Set to/ })).toBeNull();
    });

    it('offers no button when the plan already runs that many, and no limit at the cap', () => {
      render(
        <PlanRunsControl
          {...base}
          findBreakEven={null}
          stockRuns={{ runs: 10, limitingName: null }}
        />
      );
      expect(screen.getByText('Stock covers 10 runs.')).toBeVisible();
      expect(screen.queryByRole('button', { name: /^Set to/ })).toBeNull();
    });

    it('shows nothing without stock runs', () => {
      render(<PlanRunsControl {...base} findBreakEven={null} stockRuns={null} />);
      expect(screen.queryByText(/Stock covers/)).toBeNull();
    });
  });
});
