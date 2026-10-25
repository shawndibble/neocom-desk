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
    expect(screen.queryByRole('button', { name: 'Break Even' })).toBeNull();

    rerender(<PlanRunsControl {...base} findBreakEven={() => 12} />);
    expect(screen.getByRole('button', { name: 'Break Even' })).toBeVisible();
  });

  it('says so when no run count breaks even, until the profit moves', async () => {
    const user = userEvent.setup();
    const findBreakEven = vi.fn(() => null);
    const { rerender } = render(<PlanRunsControl {...base} findBreakEven={findBreakEven} />);

    await user.click(screen.getByRole('button', { name: 'Break Even' }));
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
});
