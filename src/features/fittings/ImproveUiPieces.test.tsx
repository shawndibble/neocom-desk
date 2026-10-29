import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { ImproveResult } from '@/engine/fittings/improve';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import { ImproveNothingFound } from './ImproveNothingFound';
import { ImproveSearchStatus } from './ImproveSearchStatus';
import type { ImproveSettings } from './improveSettings';
import type { ImproveLabels } from './useImproveLabels';
import type { ImproveSearch } from './useImprove';

const result = {
  makeFlyable: [],
  flyableBlocked: [],
  noDownside: [],
  tradeOffs: [],
  rejected: [],
  stopped: false,
  checked: 3,
} as unknown as ImproveResult;

const nothing = (reach: ImproveSettings['reach'], onSearchRework?: () => void) =>
  render(
    <ImproveNothingFound
      goal="overall"
      result={result}
      before={baseFittingStats()}
      fitTotal={null}
      noModules={false}
      settings={{ reach } as ImproveSettings}
      labels={{} as ImproveLabels}
      onSearchAgain={vi.fn()}
      onSearchRework={onSearchRework}
    />
  );

describe('Rework nudge', () => {
  it('offers Search with Rework when Reach is Upgrade', async () => {
    const onSearchRework = vi.fn();
    nothing('upgrade', onSearchRework);
    await userEvent.click(screen.getByRole('button', { name: 'Search with Rework' }));
    expect(onSearchRework).toHaveBeenCalledOnce();
    expect(screen.getByText(/usually takes/)).toBeInTheDocument();
  });
  it('is not offered on Rebalance', () => {
    nothing('rebalance', vi.fn());
    expect(screen.queryByRole('button', { name: 'Search with Rework' })).toBeNull();
  });
});

describe('ImproveSearchStatus round line', () => {
  const search = {
    state: { status: 'searching', checked: 41, total: 96, slow: false },
    cancel: vi.fn(),
    showBestSoFar: vi.fn(),
  } as unknown as ImproveSearch;
  it('names the round when the search has rounds', () => {
    render(<ImproveSearchStatus search={search} round={{ current: 3, max: 4 }} />);
    expect(screen.getByText('Round 3 of up to 4 · checking 41 of 96 swaps…')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(1);
  });
  it('keeps the plain line without rounds', () => {
    render(<ImproveSearchStatus search={search} />);
    expect(screen.getByText('Checking 41 of 96 swaps…')).toBeInTheDocument();
  });
});
