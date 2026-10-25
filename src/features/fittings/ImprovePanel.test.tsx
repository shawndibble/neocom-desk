import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { ImproveOption, ImproveResult } from '@/engine/fittings/improve';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { ImprovePanel } from './ImprovePanel';
import type { ImproveSearch, ImproveState } from './useImprove';

const before = baseFittingStats();

function option(
  toTypeId: number,
  patch: Partial<FittingStats>,
  extra: Partial<ImproveOption> = {}
) {
  return {
    candidate: { fromTypeId: toTypeId < 20 ? 1 : 2, toTypeId, at: [{ slot: 'low', slotIndex: 0 }] },
    fitting: {} as Fitting,
    after: { ...before, ...patch },
    score: 0.1,
    iskDelta: 1000,
    downsides: [],
    ...extra,
  } as ImproveOption;
}

function search(state: ImproveState, own: FittingStats | null = before): ImproveSearch {
  return {
    goal: 'damage',
    state,
    before: own,
    cancel: vi.fn(),
    showBestSoFar: vi.fn(),
    restart: vi.fn(),
  };
}

function done(result: Partial<ImproveResult>): ImproveState {
  return {
    status: 'done',
    before,
    elapsedMs: 1200,
    result: { noDownside: [], tradeOffs: [], rejected: [], checked: 3, stopped: false, ...result },
  };
}

const renderPanel = (s: ImproveSearch, onApply = vi.fn(), onGoalChange = vi.fn()) =>
  render(
    <ImprovePanel
      goal="damage"
      onGoalChange={onGoalChange}
      search={s}
      catalogue={null}
      onApply={onApply}
    />
  );

describe('ImprovePanel', () => {
  it('shows progress with Cancel, and Show best so far once the search is slow', async () => {
    const s = search({ status: 'searching', checked: 4, total: 10, slow: true });
    renderPanel(s);
    expect(screen.getByText('Checking 4 of 10 swaps…')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(s.cancel).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Show best so far' }));
    expect(s.showBestSoFar).toHaveBeenCalled();
  });

  it('sections No downside and Trade-offs, and applies the ticked rows together', async () => {
    const gain = option(11, { ehp: 1100 });
    const trade = option(21, { ehp: 1200 }, { downsides: ['speed'] });
    const onApply = vi.fn();
    renderPanel(search(done({ noDownside: [gain], tradeOffs: [trade] })), onApply);
    expect(screen.getByText('No downside')).toBeInTheDocument();
    expect(screen.getByText('Trade-offs')).toBeInTheDocument();
    expect(screen.getByText('Gives up: Speed')).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    expect(onApply).toHaveBeenCalledWith([gain, trade]);
  });

  it('ticks one variation per fitted module', async () => {
    const a = option(11, { ehp: 1100 });
    const b = option(12, { ehp: 1050 });
    const onApply = vi.fn();
    renderPanel(search(done({ noDownside: [a, b] })), onApply);
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);
    expect(boxes[0]).not.toBeChecked();
    await userEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
    expect(onApply).toHaveBeenCalledWith([b]);
  });

  it('says when nothing helps and lists the closest rejected swaps with the guardrail broken', () => {
    const rejected = { ...option(11, { ehp: 1100 }), guardrail: 'budget' as const };
    renderPanel(search(done({ rejected: [rejected] })));
    expect(screen.getByText('No variation of a fitted module adds damage.')).toBeInTheDocument();
    expect(screen.getByText('Goes over CPU, powergrid or calibration')).toBeInTheDocument();
  });

  it('disables a goal the fit cannot score', () => {
    const unarmed = { ...before, offense: { ...before.offense, dps: 0, sustainedDps: 0 } };
    renderPanel(search({ status: 'idle' }, unarmed));
    expect(screen.getByRole('button', { name: /More damage/ })).toHaveAttribute(
      'aria-disabled',
      'true'
    );
  });
});
