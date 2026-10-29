import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { ImproveOption, ImproveResult } from '@/engine/fittings/improve';
import { optionKey } from '@/engine/fittings/improveKeys';
import type { Fitting } from '@/engine/fittings/types';
import { MAKEOVER, MAKEOVER_KEYS } from './improveMakeoverFixture';
import { makeoverOptionsOf } from './improveMakeoverTicks';
import { ImprovePanel, type ImproveSettings } from './ImprovePanel';
import type { ImproveSearch, ImproveState } from './useImprove';

const before = baseFittingStats();

const settings = (patch: Partial<ImproveSettings> = {}): ImproveSettings => ({
  reach: 'rework',
  onReachChange: vi.fn(),
  sort: 'gain',
  onSortChange: vi.fn(),
  iskBudget: null,
  onIskBudgetChange: vi.fn(),
  defense: 'keep',
  onDefenseChange: vi.fn(),
  includeRigs: true,
  onIncludeRigsChange: vi.fn(),
  includeOfficer: false,
  onIncludeOfficerChange: vi.fn(),
  oreFamily: 'Simple Asteroid',
  onOreFamilyChange: vi.fn(),
  hold: 'cargo',
  onHoldChange: vi.fn(),
  ...patch,
});

/** A single swap of the same module as the Makeover's first row (Shield Power Relay II, low slot 0). */
const singleOnRowOne = {
  candidate: { fromTypeId: 1422, toTypeId: 31796, at: [{ slot: 'low', slotIndex: 0 }] },
  fitting: {} as Fitting,
  after: before,
  score: 0.1,
  iskDelta: 1000,
  lost: [],
} as ImproveOption;

function state(result: Partial<ImproveResult>, makeover: boolean | 'none' = true): ImproveState {
  return {
    status: 'done',
    before,
    fitTotal: null,
    elapsedMs: 1200,
    result: {
      makeFlyable: [],
      flyableOverrun: [],
      flyableBlocked: [],
      noDownside: [],
      tradeOffs: [],
      rejected: [],
      checked: 3,
      stopped: false,
      ...result,
    },
    ...(makeover === true
      ? { makeover: { makeover: MAKEOVER, options: makeoverOptionsOf(MAKEOVER, () => 1) } }
      : {}),
  };
}

const searchOf = (s: ImproveState): ImproveSearch => ({
  goal: 'overall',
  state: s,
  before,
  cancel: vi.fn(),
  showBestSoFar: vi.fn(),
  restart: vi.fn(),
  recalc: null,
  completion: null,
});

const renderPanel = (s: ImproveState, onApply = vi.fn(), config = settings()) =>
  render(
    <ImprovePanel
      goal="overall"
      onGoalChange={vi.fn()}
      search={searchOf(s)}
      catalogue={null}
      onApply={onApply}
      settings={config}
      onFixFirst={vi.fn()}
    />
  );

const applyButton = () => screen.getByRole('button', { name: /^Apply/ });

describe('Improve panel with a Makeover', () => {
  it('shows the Makeover group with every row ticked', () => {
    renderPanel(state({}));
    expect(screen.getByRole('heading', { name: 'Makeover' })).toBeInTheDocument();
    expect(applyButton()).toHaveTextContent(String(MAKEOVER_KEYS.length));
    // its rows are the Makeover's own, not covers added from the footer
    expect(screen.queryByText(/Added to cover/)).toBeNull();
  });

  it('unticks the whole group from its tick', async () => {
    renderPanel(state({}));
    await userEvent.click(screen.getByRole('checkbox', { name: /^Whole Makeover/ }));
    expect(applyButton()).not.toHaveTextContent(String(MAKEOVER_KEYS.length));
    expect(applyButton()).toBeDisabled();
  });

  it('shows the Makeover when no single swap was found', () => {
    renderPanel(state({}));
    expect(screen.queryByText(/Search with Rework/)).toBeNull();
    expect(screen.getByRole('heading', { name: 'Makeover' })).toBeInTheDocument();
  });

  it('applies the ticked Makeover rows together with a ticked single swap on another slot', async () => {
    const elsewhere = {
      ...singleOnRowOne,
      candidate: { fromTypeId: 5, toTypeId: 6, at: [{ slot: 'high', slotIndex: 7 }] },
    } as ImproveOption;
    const onApply = vi.fn();
    renderPanel(state({ noDownside: [elsewhere] }), onApply);
    await userEvent.click(screen.getByRole('checkbox', { name: /^#5 → #6/ }));
    await userEvent.click(applyButton());
    const applied = onApply.mock.calls[0][0] as ImproveOption[];
    expect(applied.map(optionKey).sort()).toEqual([...MAKEOVER_KEYS, optionKey(elsewhere)].sort());
  });

  it('unticks a Makeover row when a single swap on its slot is ticked, and the reverse', async () => {
    const onApply = vi.fn();
    renderPanel(state({ noDownside: [singleOnRowOne] }), onApply);
    const single = screen.getByRole('checkbox', { name: /^#1422 → #31796/ });
    expect(single).not.toBeChecked();
    await userEvent.click(single);
    expect(single).toBeChecked();
    expect(applyButton()).toHaveTextContent(String(MAKEOVER_KEYS.length));
    await userEvent.click(applyButton());
    const applied = (onApply.mock.calls[0][0] as ImproveOption[]).map(optionKey);
    expect(applied).toContain(optionKey(singleOnRowOne));
    expect(applied).not.toContain(MAKEOVER_KEYS[0]);
  });
});

describe('Improve panel nudge', () => {
  it('switches Reach to Rework from the nothing-found nudge', async () => {
    const onReachChange = vi.fn();
    renderPanel(state({}, 'none'), vi.fn(), settings({ reach: 'upgrade', onReachChange }));
    await userEvent.click(screen.getByRole('button', { name: 'Search with Rework' }));
    expect(onReachChange).toHaveBeenCalledWith('rework');
  });
});
