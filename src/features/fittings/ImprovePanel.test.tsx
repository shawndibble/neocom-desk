import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { ImproveGoal, ImproveOption, ImproveResult } from '@/engine/fittings/improve';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { ImprovePanel, type ImproveSettings } from './ImprovePanel';
import type { ImproveSearch, ImproveState } from './useImprove';

const before = baseFittingStats();

function option(
  toTypeId: number,
  patch: Partial<FittingStats>,
  extra: Partial<ImproveOption> = {}
) {
  return {
    candidate: {
      fromTypeId: toTypeId < 20 ? 1 : 2,
      toTypeId,
      at: [{ slot: 'low', slotIndex: toTypeId < 20 ? 0 : 1 }],
    },
    fitting: {} as Fitting,
    after: { ...before, ...patch },
    score: 0.1,
    iskDelta: 1000,
    destroysRigs: false,
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

function done(result: Partial<ImproveResult>, own: FittingStats = before): ImproveState {
  return {
    status: 'done',
    before: own,
    elapsedMs: 1200,
    result: { noDownside: [], tradeOffs: [], rejected: [], checked: 3, stopped: false, ...result },
  };
}

const settings = (patch: Partial<ImproveSettings> = {}): ImproveSettings => ({
  reach: 'upgrade',
  onReachChange: vi.fn(),
  mode: 'buy',
  onModeChange: vi.fn(),
  spendCap: null,
  onSpendCapChange: vi.fn(),
  defense: 'keep',
  onDefenseChange: vi.fn(),
  includeRigs: false,
  onIncludeRigsChange: vi.fn(),
  includeOfficer: false,
  onIncludeOfficerChange: vi.fn(),
  oreFamily: 'Simple Asteroid',
  onOreFamilyChange: vi.fn(),
  hold: 'cargo',
  onHoldChange: vi.fn(),
  ...patch,
});

const renderPanel = (
  s: ImproveSearch,
  onApply = vi.fn(),
  onGoalChange = vi.fn(),
  config: ImproveSettings = settings(),
  extra: { onFixFirst?: () => void; freeSections?: ReactNode; goal?: ImproveGoal } = {}
) =>
  render(
    <ImprovePanel
      goal={extra.goal ?? 'damage'}
      onGoalChange={onGoalChange}
      search={s}
      catalogue={null}
      onApply={onApply}
      settings={config}
      onFixFirst={extra.onFixFirst ?? vi.fn()}
      freeSections={extra.freeSections}
    />
  );

describe('ImprovePanel', () => {
  it('shows Fix this first and no suggestions for an over-budget fit', async () => {
    const onFixFirst = vi.fn();
    renderPanel(
      search({ status: 'overBudget', resources: ['cpu', 'calibration'] }),
      vi.fn(),
      vi.fn(),
      settings(),
      { onFixFirst, freeSections: <p>Train rows</p> }
    );
    expect(screen.getByRole('heading', { name: 'Fix this first' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Improve Goal' })).not.toBeInTheDocument();
    expect(screen.queryByText('Train rows')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Fix calibration' }));
    expect(onFixFirst).toHaveBeenCalledWith('calibration');
    expect(screen.getByRole('button', { name: 'Fix CPU' })).toBeInTheDocument();
  });

  it('shows the free sections above the swaps when the fit fits', () => {
    renderPanel(
      search(done({ noDownside: [option(10, { ehp: before.ehp * 2 })] })),
      vi.fn(),
      vi.fn(),
      settings(),
      { freeSections: <p>Train rows</p> }
    );
    const train = screen.getByText('Train rows');
    const swaps = screen.getByRole('heading', { name: 'No downside' });
    expect(train.compareDocumentPosition(swaps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

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

  it('shows Reach, mode, Defense Choice and the spend cap, and reports a pick', async () => {
    const config = settings();
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), config);
    expect(screen.getByRole('group', { name: 'Improve Reach' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Defense Choice' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rework' }));
    expect(config.onReachChange).toHaveBeenCalledWith('rework');
    await userEvent.click(screen.getByRole('button', { name: 'Refitting a ship I own' }));
    expect(config.onModeChange).toHaveBeenCalledWith('refit');
    await userEvent.click(screen.getByRole('button', { name: 'Armor' }));
    expect(config.onDefenseChange).toHaveBeenCalledWith('armor');
  });

  it('keeps Rigs and Officer behind a collapsed, unticked group', async () => {
    const config = settings();
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), config);
    expect(screen.queryByRole('checkbox', { name: 'Rigs' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Also try…' }));
    const rigs = screen.getByRole('checkbox', { name: 'Rigs' });
    expect(rigs).not.toBeChecked();
    await userEvent.click(rigs);
    expect(config.onIncludeRigsChange).toHaveBeenCalledWith(true);
  });

  it('flags a rig change in a refit and labels an add and a pair', () => {
    const add = option(
      30,
      {},
      {
        candidate: { fromTypeId: null, toTypeId: 30, at: [{ slot: 'low', slotIndex: 2 }] },
      }
    );
    const rig = option(
      31,
      {},
      {
        destroysRigs: true,
        candidate: { fromTypeId: 5, toTypeId: 31, at: [{ slot: 'rig', slotIndex: 0 }] },
      }
    );
    const pair = option(
      32,
      {},
      {
        candidate: {
          fromTypeId: null,
          toTypeId: 32,
          at: [{ slot: 'low', slotIndex: 3 }],
          pairedWith: { fromTypeId: 3, toTypeId: 4, at: [{ slot: 'low', slotIndex: 1 }] },
        },
      }
    );
    renderPanel(search(done({ noDownside: [add, rig, pair] })));
    expect(screen.getByText('Add #30')).toBeInTheDocument();
    expect(screen.getByText(/Removing the old rig destroys it/)).toBeInTheDocument();
    expect(screen.getByText('Add #32, paid for by #3 → #4')).toBeInTheDocument();
  });

  it('shows both Defense sides, a side with nothing to offer as no gain', () => {
    const state = done({ noDownside: [option(30, {})] });
    if (state.status !== 'done') throw new Error('state');
    const empty = { noDownside: [], tradeOffs: [], rejected: [], checked: 2, stopped: false };
    renderPanel(
      search({
        ...state,
        sides: { shield: state.result, armor: empty },
      }),
      vi.fn(),
      vi.fn(),
      settings({ defense: 'shield' })
    );
    expect(screen.getByTestId('improve-sides')).toHaveTextContent(
      'Shield: up to +10% · Armor: no gain'
    );
  });

  it('disables Mine more with its reason on a fit with no miners', async () => {
    renderPanel(search({ status: 'idle' }, before));
    const chip = screen.getByRole('button', { name: /Mine more/ });
    expect(chip).toHaveAttribute('aria-disabled', 'true');
    await userEvent.hover(chip);
    expect(await screen.findByText('No miners on this fit')).toBeInTheDocument();
  });

  it('shows the ore on every Mine more row and in the closest swaps, with the m³/s it gives', () => {
    const mining = (perSecond: number) => ({
      rows: [],
      perSecond,
      perHour: perSecond * 3600,
      wastePerSecond: 0,
      wastePct: 0,
    });
    const own = { ...before, mining: mining(10) };
    const gain = option(10, { mining: mining(12.5) });
    const broke = { ...option(21, { mining: mining(11) }), guardrail: 'budget' as const };
    const noGain = search(
      done(
        { noDownside: [gain, { ...gain, candidate: { ...gain.candidate, toTypeId: 11 } }] },
        own
      ),
      own
    );
    renderPanel(noGain, vi.fn(), vi.fn(), settings(), { goal: 'mining' });
    const lines = screen.getAllByText(/Mines 10 → 12\.5 m³\/s of Veldspar, Scordite/);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toHaveTextContent('(Simple Asteroid crystals)');
    cleanup();
    renderPanel(search(done({ rejected: [broke] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'mining',
    });
    expect(screen.getByText(/Mines 10 → 11 m³\/s of Veldspar/)).toBeInTheDocument();
  });

  it('reports the ore the pilot picks', async () => {
    const onOreFamilyChange = vi.fn();
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), settings({ onOreFamilyChange }), {
      goal: 'mining',
    });
    await userEvent.click(screen.getByRole('combobox', { name: 'Ore' }));
    await userEvent.click(await screen.findByRole('option', { name: /Rare Moon/ }));
    expect(onOreFamilyChange).toHaveBeenCalledWith('Rare Moon');
  });

  it('disables Carry more, Align faster and Align and warp faster with their reasons on a hull without them', async () => {
    const bare = {
      ...before,
      navigation: { ...before.navigation, agility: 0, warpSpeed: 0 },
    };
    renderPanel(search({ status: 'idle' }, bare));
    for (const [name, reason] of [
      [/Carry more/, 'This hull has no cargo or other hold'],
      [/^Align faster/, 'This hull has no align time to improve'],
      [/Align and warp faster/, 'This hull has no align time or warp speed to improve'],
    ] as const) {
      const chip = screen.getByRole('button', { name });
      expect(chip).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(chip);
      expect(await screen.findByText(reason)).toBeInTheDocument();
    }
  });

  it('shows the hold before and after on a Carry more row, and reports the hold the pilot picks', async () => {
    const own = { ...before, holds: { ...before.holds, cargo: 1000, iceHold: 400 } };
    const gain = option(10, { holds: { ...own.holds, cargo: 1250 } });
    const onHoldChange = vi.fn();
    renderPanel(
      search(done({ noDownside: [gain] }, own), own),
      vi.fn(),
      vi.fn(),
      settings({ onHoldChange }),
      { goal: 'haul' }
    );
    expect(screen.getByText('Cargo hold 1,000 → 1,250 m³')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('combobox', { name: 'Hold' }));
    await userEvent.click(await screen.findByRole('option', { name: /Ice hold/ }));
    expect(onHoldChange).toHaveBeenCalledWith('iceHold');
  });

  it('shows align time and warp speed on an Align and warp faster row', () => {
    const own = { ...before, navigation: { ...before.navigation, warpSpeed: 3 } };
    const gain = option(10, { navigation: { ...own.navigation, agility: 2, warpSpeed: 3.6 } });
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'warp',
    });
    expect(screen.getByText(/Align 55\.45 → 27\.73 s · Warp 3 → 3\.6 AU\/s/)).toBeInTheDocument();
  });

  it('disables Repair more and Transfer more with their reasons on a fit that gives neither', async () => {
    renderPanel(search({ status: 'idle' }));
    for (const [name, reason] of [
      [/Repair more/, 'No remote repairers on this fit'],
      [/Transfer more/, 'No remote capacitor transmitters on this fit'],
    ] as const) {
      const chip = screen.getByRole('button', { name });
      expect(chip).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(chip);
      expect(await screen.findByText(reason)).toBeInTheDocument();
    }
  });

  it('shows HP/s on a Repair more row and GJ/s on a Transfer more row', () => {
    const support = { ...before.support, remoteRepair: { shield: 0, armor: 100, hull: 0 } };
    const own = { ...before, support };
    const gain = option(10, {
      support: { ...support, remoteRepair: { shield: 0, armor: 125.5, hull: 0 }, capTransfer: 40 },
    });
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'repair',
    });
    expect(screen.getByText('Repairs 100 → 125.5 HP/s')).toBeInTheDocument();
    cleanup();
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'transfer',
    });
    expect(screen.getByText('Transfers 0 → 40 GJ/s')).toBeInTheDocument();
  });
  it('disables Hold tighter and Stronger EWAR with their reasons on a fit with neither', async () => {
    renderPanel(search({ status: 'idle' }));
    for (const [name, reason] of [
      [/Hold tighter/, 'No warp scramblers, disruptors or webs on this fit'],
      [/Stronger EWAR/, 'No electronic warfare modules on this fit'],
    ] as const) {
      const chip = screen.getByRole('button', { name });
      expect(chip).toHaveAttribute('aria-disabled', 'true');
      await userEvent.hover(chip);
      expect(await screen.findByText(reason)).toBeInTheDocument();
    }
  });

  it('shows tackle figures on a Hold tighter row and labels EWAR as module figures', () => {
    const row = (kind: 'warpDisruption' | 'web' | 'ecm', amount: number, optimal: number) => ({
      kind,
      typeId: 1,
      count: 1,
      amount,
      optimal,
      falloff: 0,
      effects: [],
    });
    const withRows = (rows: ReturnType<typeof row>[]) => ({
      ...before,
      support: { ...before.support, rows },
    });
    const own = withRows([
      row('warpDisruption', 2, 9000),
      row('web', 50, 10000),
      row('ecm', 4, 20000),
    ]);
    const gain = option(10, {
      support: {
        ...before.support,
        rows: [row('warpDisruption', 3, 12000), row('web', 60, 12000), row('ecm', 5, 30000)],
      },
    });
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'tackle',
    });
    expect(screen.getByText('Points 2 → 3 · Web 50 → 60% · Reach 9 → 12 km')).toBeInTheDocument();
    cleanup();
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'ewar',
    });
    expect(
      screen.getByText('Module strength 4 → 5 · Reach 20 → 30 km (not the effect on a target)')
    ).toBeInTheDocument();
  });
});
