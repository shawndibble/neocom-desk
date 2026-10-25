import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { baseFittingStats } from '@/engine/fittings/__fixtures__/fittingStats';
import type { ImproveGoal, ImproveOption, ImproveResult } from '@/engine/fittings/improve';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import type { TargetProfile } from '@/engine/fittings/targetProfile';
import type { UnloadedWeapons } from '@/engine/fittings/improveCharges';
import type { FittingStatsDelta } from '@/engine/fittings/variationDelta';
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
    lost: [],
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
    recalc: null,
  };
}

function done(result: Partial<ImproveResult>, own: FittingStats = before): ImproveState {
  return {
    status: 'done',
    before: own,
    fitTotal: null,
    elapsedMs: 1200,
    result: { noDownside: [], tradeOffs: [], rejected: [], checked: 3, stopped: false, ...result },
  };
}

const openMoreGoals = () => userEvent.click(screen.getByRole('button', { name: /^More goals/ }));
const openSettings = () =>
  userEvent.click(screen.getByRole('button', { name: /^Search settings/ }));

const settings = (patch: Partial<ImproveSettings> = {}): ImproveSettings => ({
  reach: 'upgrade',
  onReachChange: vi.fn(),
  sort: 'gain',
  onSortChange: vi.fn(),
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
  extra: {
    onFixFirst?: () => void;
    freeSections?: ReactNode;
    goal?: ImproveGoal;
    unloaded?: UnloadedWeapons | null;
    onLoadBestCharge?: () => void;
    fitting?: Fitting;
    onPreview?: (delta: FittingStatsDelta | null) => void;
    target?: TargetProfile;
  } = {}
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
      unloaded={extra.unloaded}
      onLoadBestCharge={extra.onLoadBestCharge}
      fitting={extra.fitting}
      onPreview={extra.onPreview}
      target={extra.target}
    />
  );

describe('ImprovePanel', () => {
  it('warns about launchers with no missiles and offers Load best charge', async () => {
    const onLoadBestCharge = vi.fn();
    renderPanel(search(done({})), vi.fn(), vi.fn(), settings(), {
      unloaded: { count: 2, kind: 'launcher' },
      onLoadBestCharge,
    });
    expect(
      screen.getByText(
        '2 launchers have no missiles loaded, so swaps are scored as if they held the best one.'
      )
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load best charge' }));
    expect(onLoadBestCharge).toHaveBeenCalledOnce();
  });

  it('shows no notice when every weapon is loaded', () => {
    renderPanel(search(done({})), vi.fn(), vi.fn(), settings(), { unloaded: null });
    expect(screen.queryByText(/no missiles loaded|no ammo loaded/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load best charge' })).not.toBeInTheDocument();
  });

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
    const trade = option(
      21,
      { ehp: 1200 },
      {
        lost: [{ kind: 'stat', change: { key: 'maxVelocity', before: 300, after: 250 } }],
      }
    );
    const onApply = vi.fn();
    renderPanel(search(done({ noDownside: [gain], tradeOffs: [trade] })), onApply);
    expect(screen.getByText('No downside')).toBeInTheDocument();
    expect(screen.getByText('Trade-offs')).toBeInTheDocument();
    expect(screen.getByText(/Gives up:/)).toBeInTheDocument();
    expect(screen.getByText(/Max velocity 300 to 250 m\/s, worse/)).toBeInTheDocument();
    const apply = screen.getByRole('button', { name: 'Apply' });
    expect(apply).toBeDisabled();
    // Opaque in the drawer's surface token, so rows scrolling under it don't show through.
    expect(apply.closest('.sticky')).toHaveClass('bg-panel');
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);
    await userEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
    expect(onApply).toHaveBeenCalledWith([gain, trade]);
  });

  it('shows one row per module with its best option, the rest behind "more options"', async () => {
    const best = option(11, { ehp: 1100 }, { score: 0.3 });
    const other = option(12, { ehp: 1050 }, { score: 0.1 });
    renderPanel(search(done({ noDownside: [other, best] })));
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    expect(screen.getByText('+30%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '1 more option' }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText('+10%')).toBeInTheDocument();
  });

  it('leads a damage row with its DPS before → after', () => {
    const own = { ...before, offense: { ...before.offense, sustainedDps: 90.7 } };
    const gain = option(11, { offense: { ...before.offense, sustainedDps: 128 } });
    renderPanel(search(done({ noDownside: [gain] }, own), own));
    const row = screen.getByRole('checkbox').closest('li')!;
    expect(row.querySelector('[data-verdict="better"]')).toHaveTextContent('→ 128');
    expect(row).toHaveTextContent('90.7');
  });

  const missile = (dps: number) =>
    ({
      kind: 'missile',
      dps,
      range: 40000,
      explosionRadius: 140,
      explosionVelocity: 85,
      damageReductionFactor: 0.682,
      em: 0,
      thermal: 0,
      kinetic: 1,
      explosive: 0,
    }) as FittingStats['applied']['weapons'][number];
  const applied = (dps: number) => ({ weapons: [missile(dps)], droneControlRange: 20000 });
  const frigate: TargetProfile = { signatureRadius: 40, velocity: 400 };

  it('labels a damage lead Applied DPS against a Target Profile, apart from Sustained DPS', () => {
    const own = {
      ...before,
      applied: applied(100),
      offense: { ...before.offense, sustainedDps: 90.7 },
    };
    const gain = option(11, {
      applied: applied(150),
      offense: { ...before.offense, sustainedDps: 128 },
    });
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      target: frigate,
    });
    const row = screen.getByRole('checkbox').closest('li')!;
    const [lead, detail] = row.querySelectorAll('span.block.text-xs');
    expect(lead).toHaveTextContent('Applied DPS');
    expect(lead).not.toHaveTextContent('Sustained DPS');
    expect(detail).toHaveTextContent('Sustained DPS 90.7 → 128');
  });

  it("never shows the same stat in a row's lead line and its detail line", () => {
    const own = { ...before, offense: { ...before.offense, sustainedDps: 90.7 } };
    const gain = option(11, { offense: { ...before.offense, sustainedDps: 128 } });
    renderPanel(search(done({ noDownside: [gain] }, own), own));
    const row = screen.getByRole('checkbox').closest('li')!;
    const [lead, detail] = row.querySelectorAll('span.block.text-xs');
    expect(lead).toHaveTextContent('Sustained DPS');
    expect(detail).not.toHaveTextContent('Sustained DPS');
  });

  it('leads Best overall with what changed, not DPS and EHP that stood still', () => {
    const gain = option(11, { capacitor: { stable: true, stablePercentage: 70 } });
    renderPanel(search(done({ noDownside: [gain] })), vi.fn(), vi.fn(), settings(), {
      goal: 'overall',
    });
    const [lead] = screen
      .getByRole('checkbox')
      .closest('li')!
      .querySelectorAll('span.block.text-xs');
    expect(lead).toHaveTextContent('Capacitor');
    expect(lead).toHaveTextContent('stable at 70%');
    expect(lead).not.toHaveTextContent('DPS');
    expect(lead).not.toHaveTextContent('EHP');
  });

  it('heads the results with the goal figure now → best found, hidden with no result', () => {
    const own = { ...before, offense: { ...before.offense, sustainedDps: 90.7 } };
    const small = option(11, { offense: { ...before.offense, sustainedDps: 100 } }, { score: 0.1 });
    const big = option(12, { offense: { ...before.offense, sustainedDps: 128 } }, { score: 0.4 });
    renderPanel(search(done({ noDownside: [small], tradeOffs: [big] }, own), own));
    const header = screen.getByTestId('improve-best-found');
    expect(header).toHaveTextContent('Now → best found');
    expect(header).toHaveTextContent('90.7');
    expect(header).toHaveTextContent('→ 128');
    cleanup();
    renderPanel(search(done({}, own), own));
    expect(screen.queryByTestId('improve-best-found')).not.toBeInTheDocument();
  });

  it('orders each section by the remembered sort, and reports a change', async () => {
    const pricey = option(11, { ehp: 1100 }, { score: 0.5, iskDelta: 900_000_000 });
    const cheap = option(21, { ehp: 1100 }, { score: 0.1, iskDelta: 1_000_000 });
    const state = search(done({ noDownside: [cheap, pricey] }));
    const first = () => screen.getAllByRole('checkbox')[0]!.closest('li')!;
    const onSortChange = vi.fn();
    const { unmount } = renderPanel(state, vi.fn(), vi.fn(), settings({ onSortChange }));
    expect(first()).toHaveTextContent('+50%');
    await userEvent.click(screen.getByRole('button', { name: 'Best value' }));
    expect(onSortChange).toHaveBeenCalledWith('value');
    unmount();
    renderPanel(state, vi.fn(), vi.fn(), settings({ sort: 'value' }));
    expect(first()).toHaveTextContent('+10%');
  });

  it('opens "N other stats" inline', async () => {
    const gain = option(11, {
      ehp: 1100,
      cpuUsed: before.cpuUsed + 1,
      powergridUsed: before.powergridUsed + 1,
      calibrationUsed: before.calibrationUsed + 1,
      droneDps: before.droneDps + 1,
      droneCapacity: before.droneCapacity + 1,
      capacitorCapacity: before.capacitorCapacity + 1,
    });
    renderPanel(search(done({ noDownside: [gain] })));
    const row = screen.getByRole('checkbox').closest('li')!;
    const before_ = row.querySelectorAll('[data-verdict]').length;
    await userEvent.click(screen.getByRole('button', { name: /other stats?/ }));
    expect(row.querySelectorAll('[data-verdict]').length).toBeGreaterThan(before_);
    expect(screen.queryByRole('button', { name: /other stats?/ })).not.toBeInTheDocument();
  });

  it('ticks one variation per fitted module', async () => {
    const a = option(11, { ehp: 1100 });
    const b = option(12, { ehp: 1050 });
    const onApply = vi.fn();
    renderPanel(search(done({ noDownside: [a, b] })), onApply);
    await userEvent.click(screen.getByRole('button', { name: '1 more option' }));
    const boxes = screen.getAllByRole('checkbox');
    await userEvent.click(boxes[0]);
    await userEvent.click(boxes[1]);
    expect(
      screen.getAllByRole('checkbox').filter((box) => (box as HTMLInputElement).checked)
    ).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Apply 1 change' }));
    expect(onApply).toHaveBeenCalledWith([b]);
  });

  it('says when nothing helps and lists the closest rejected swaps with the guardrail broken', () => {
    const rejected = { ...option(11, { ehp: 1100 }), guardrail: 'budget' as const };
    renderPanel(search(done({ rejected: [rejected] })));
    expect(screen.getByText('No variation of a fitted module adds damage.')).toBeInTheDocument();
    expect(screen.getByText('Goes over CPU, powergrid or calibration')).toBeInTheDocument();
  });

  it('names the overage on a swap over the budget or the cap', () => {
    const rejected = {
      ...option(11, { ehp: 1100 }, { iskDelta: 12_300_000 }),
      guardrail: 'spend' as const,
    };
    const state = { ...done({ rejected: [rejected] }), fitTotal: 40_000_000 } as ImproveState;
    const { unmount } = renderPanel(
      search(state),
      vi.fn(),
      vi.fn(),
      settings({ mode: 'buy', spendCap: 50_000_000 })
    );
    expect(screen.getByText('Over your 50M budget by 2.3M')).toBeInTheDocument();
    unmount();
    renderPanel(search(state), vi.fn(), vi.fn(), settings({ mode: 'refit', spendCap: 5_000_000 }));
    expect(screen.getByText('7.3M over your 5M cap')).toBeInTheDocument();
  });

  it('shows a notice and no results when the budget is below the fit price', () => {
    renderPanel(search({ status: 'belowPrice', budget: 5_000_000, fitTotal: 40_100_000 }));
    expect(
      screen.getByText(/Your budget \(5M\) is below this fit's price \(40\.1M\)/)
    ).toBeInTheDocument();
  });

  it('leads with the hull role goals and keeps the settings collapsed', () => {
    renderPanel(search({ status: 'idle' }));
    expect(screen.getByRole('button', { name: /Best overall/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Carry more/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Search settings/ })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(screen.queryByRole('group', { name: 'Improve Reach' })).not.toBeInTheDocument();
  });

  it('names the settings toggle with its label and summary, and toggles on click', async () => {
    renderPanel(search({ status: 'idle' }));
    const toggle = screen.getByRole('button', { name: /^Search settings.*Upgrade/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Improve Reach' })).toBeInTheDocument();
  });

  it('says nothing could be added on a fit with no modules', () => {
    const blank = { name: 'Blank', shipTypeId: 1, modules: [], drones: [], cargo: [] };
    renderPanel(search(done({})), vi.fn(), vi.fn(), settings(), { fitting: blank });
    expect(
      screen.getByText('Nothing could be added to this fit within the guardrails.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/No variation of a fitted/)).not.toBeInTheDocument();
  });

  it('moves a goal the fit cannot score under More goals, disabled, with its reason', async () => {
    const unarmed = { ...before, offense: { ...before.offense, dps: 0, sustainedDps: 0 } };
    renderPanel(search({ status: 'idle' }, unarmed), vi.fn(), vi.fn(), settings(), {
      goal: 'overall',
    });
    expect(screen.queryByRole('button', { name: /More damage/ })).not.toBeInTheDocument();
    await openMoreGoals();
    expect(screen.getByRole('button', { name: /More damage/ })).toBeDisabled();
    expect(screen.getByText('Nothing on this fit deals damage')).toBeInTheDocument();
  });

  it('shows Reach, mode, Defense Choice and the spend cap, and reports a pick', async () => {
    const config = settings({ reach: 'rebalance' });
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), config, { goal: 'tank' });
    await openSettings();
    expect(screen.getByRole('group', { name: 'Improve Reach' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Defense Choice' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rework' }));
    expect(config.onReachChange).toHaveBeenCalledWith('rework');
    await userEvent.click(screen.getByRole('button', { name: 'Refitting a ship I own' }));
    expect(config.onModeChange).toHaveBeenCalledWith('refit');
    await userEvent.click(screen.getByRole('button', { name: 'Armor' }));
    expect(config.onDefenseChange).toHaveBeenCalledWith('armor');
  });

  it('hides Defense Choice on goals it does not change', async () => {
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), settings(), { goal: 'mining' });
    await openSettings();
    expect(screen.queryByRole('group', { name: 'Defense Choice' })).not.toBeInTheDocument();
  });

  it('disables Shield and Armor under Upgrade, with the reason', async () => {
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), settings(), { goal: 'tank' });
    await openSettings();
    expect(screen.getByRole('button', { name: 'Armor' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('button', { name: 'Shield' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Pick Rebalance or Rework to change tank side')).toBeInTheDocument();
  });

  it('keeps Rigs and Officer behind a collapsed, unticked group', async () => {
    const config = settings();
    renderPanel(search({ status: 'idle' }), vi.fn(), vi.fn(), config);
    await openSettings();
    expect(screen.queryByRole('checkbox', { name: 'Rigs' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Rigs and officer modules' }));
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
    await openMoreGoals();
    expect(screen.getByRole('button', { name: /Mine more/ })).toBeDisabled();
    expect(screen.getByText('No miners on this fit')).toBeInTheDocument();
  });

  it('shows the m³/s on every Mine more row and in the closest swaps, without repeating the ore', () => {
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
        {
          noDownside: [
            gain,
            {
              ...gain,
              candidate: {
                ...gain.candidate,
                toTypeId: 11,
                at: [{ slot: 'low' as const, slotIndex: 1 }],
              },
            },
          ],
        },
        own
      ),
      own
    );
    renderPanel(noGain, vi.fn(), vi.fn(), settings(), { goal: 'mining' });
    const lines = screen.getAllByText('Mines 10 → 12.5 m³/s');
    // Two rows plus the best-found header.
    expect(lines).toHaveLength(3);
    // The ore name lives in the Ore picker only: rows don't repeat it.
    expect(screen.getAllByText(/Veldspar/)).toHaveLength(1);
    cleanup();
    renderPanel(search(done({ rejected: [broke] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'mining',
    });
    expect(screen.getByText('Mines 10 → 11 m³/s')).toBeInTheDocument();
  });

  it('warns about miners with no crystal, offers Load best crystal, and keeps Now at the fit as it is', async () => {
    const mining = (perSecond: number) => ({
      rows: [],
      perSecond,
      perHour: perSecond * 3600,
      wastePerSecond: 0,
      wastePct: 0,
    });
    const asIs = { ...before, mining: mining(24.7) };
    const withBest = { ...before, mining: mining(55.6) };
    const gain = option(10, { mining: mining(57.1) });
    const onLoadBestCrystal = vi.fn();
    const state = {
      ...done({ noDownside: [gain] }, withBest),
      fitAsIs: asIs,
      crystals: {
        bestKey: 'B2',
        unloaded: { count: 2, steps: [] },
      },
    } as ImproveState;
    render(
      <ImprovePanel
        goal="mining"
        onGoalChange={vi.fn()}
        search={search(state, withBest)}
        catalogue={null}
        onApply={vi.fn()}
        settings={settings()}
        onFixFirst={vi.fn()}
        onLoadBestCrystal={onLoadBestCrystal}
      />
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      '2 miners have no crystal for Simple Asteroid ore, so they mine 24.7 m³/s; with Type B II, 55.6.'
    );
    expect(screen.getByTestId('improve-best-found')).toHaveTextContent(
      'Now → best found Mines 24.7 → 57.1 m³/s'
    );
    expect(screen.getByTestId('improve-best-found')).toHaveTextContent(
      'Rows use the best crystals for Veldspar'
    );
    await userEvent.click(screen.getByRole('button', { name: 'Load best crystal' }));
    expect(onLoadBestCrystal).toHaveBeenCalled();
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
    await openMoreGoals();
    for (const [name, reason] of [
      [/Carry more/, 'This hull has no cargo or other hold'],
      [/^Align faster/, 'This hull has no align time to improve'],
      [/Align and warp faster/, 'This hull has no align time or warp speed to improve'],
    ] as const) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
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
    expect(screen.getAllByText('Cargo hold 1,000 → 1,250 m³')).toHaveLength(2);
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
    expect(screen.getAllByText(/Align 55\.45 → 27\.73 s · Warp 3 → 3\.6 AU\/s/)).toHaveLength(2);
  });

  it('disables Repair more and Transfer more with their reasons on a fit that gives neither', async () => {
    renderPanel(search({ status: 'idle' }));
    await openMoreGoals();
    for (const [name, reason] of [
      [/Repair more/, 'No remote repairers on this fit'],
      [/Transfer more/, 'No remote capacitor transmitters on this fit'],
    ] as const) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
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
    expect(screen.getAllByText('Repairs 100 → 125.5 HP/s')).toHaveLength(2);
    cleanup();
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'transfer',
    });
    expect(screen.getAllByText('Transfers 0 → 40 GJ/s')).toHaveLength(2);
  });
  it('disables Hold tighter and Stronger EWAR with their reasons on a fit with neither', async () => {
    renderPanel(search({ status: 'idle' }));
    await openMoreGoals();
    for (const [name, reason] of [
      [/Hold tighter/, 'No warp scramblers, disruptors or webs on this fit'],
      [/Stronger EWAR/, 'No electronic warfare modules on this fit'],
    ] as const) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
      expect(screen.getByText(reason)).toBeInTheDocument();
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
    expect(screen.getAllByText('Points 2 → 3 · Web 50 → 60% · Reach 9 → 12 km')).toHaveLength(2);
    cleanup();
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'ewar',
    });
    expect(
      screen.getAllByText('Module strength 4 → 5 · Reach 20 → 30 km (not the effect on a target)')
    ).toHaveLength(2);
  });
  it('disables Stronger fleet support with its reason on a fit with no fleet modules', async () => {
    renderPanel(search({ status: 'idle' }));
    await openMoreGoals();
    expect(screen.getByRole('button', { name: /Stronger fleet support/ })).toBeDisabled();
    expect(
      screen.getByText('No command bursts, compressors or industrial core on this fit')
    ).toBeInTheDocument();
  });

  it('shows only the fleet figures the fit has on a Stronger fleet support row', () => {
    const withSupport = (strength: number, rangeMeters: number, fuel: number) => ({
      ...before,
      fleetSupport: {
        bursts: [
          {
            typeId: 1,
            count: 1,
            strengths: [strength],
            rangeMeters,
            durationSeconds: 60,
            reloadSeconds: 30,
          },
        ],
        compressors: [],
        core: { typeId: 3, fuelTypeId: 4, fuelPerCycle: fuel, cycleSeconds: 3600 },
      },
    });
    const own = withSupport(10, 30000, 200);
    const gain = option(10, { fleetSupport: withSupport(12, 40000, 150).fleetSupport });
    renderPanel(search(done({ noDownside: [gain] }, own), own), vi.fn(), vi.fn(), settings(), {
      goal: 'command',
    });
    expect(
      screen.getAllByText(
        'Burst strength 10 → 12 · Burst reach 30 → 40 km · Core fuel 200 → 150 per cycle'
      )
    ).toHaveLength(2);
  });

  describe('combined check', () => {
    const fitting = {
      modules: [
        { slot: 'low', slotIndex: 0, typeId: 1 },
        { slot: 'low', slotIndex: 1, typeId: 2 },
      ],
    } as unknown as Fitting;
    const checked = (after: FittingStats, state: ImproveState) => ({
      ...search(state),
      recalc: vi.fn().mockResolvedValue(after),
    });

    it('shows the cost and combined stats, then applies', async () => {
      const a = option(11, { ehp: 1100 });
      const b = option(21, { ehp: 1200 });
      const onApply = vi.fn();
      const s = checked({ ...before, ehp: before.ehp + 700 }, done({ noDownside: [a, b] }));
      renderPanel(s, onApply, vi.fn(), settings(), { fitting });
      const boxes = screen.getAllByRole('checkbox');
      await userEvent.click(boxes[0]);
      await userEvent.click(boxes[1]);
      const summary = await screen.findByTestId('improve-selection');
      expect(summary).toHaveTextContent('2 changes');
      expect(summary).toHaveTextContent('EHP 1,000 → 1,700');
      expect(s.recalc).toHaveBeenLastCalledWith(expect.anything());
      await userEvent.click(screen.getByRole('button', { name: 'Apply 2 changes' }));
      expect(onApply).toHaveBeenCalledWith([a, b]);
    });

    it('blocks Apply and names the budget the set over-runs', async () => {
      const a = option(11, { ehp: 1100 });
      const onApply = vi.fn();
      const s = checked({ ...before, cpuUsed: before.cpuTotal + 10 }, done({ noDownside: [a] }));
      renderPanel(s, onApply, vi.fn(), settings(), { fitting });
      await userEvent.click(screen.getByRole('checkbox'));
      expect(await screen.findByRole('alert')).toHaveTextContent('over-run the CPU');
      expect(screen.getByRole('button', { name: 'Apply 1 change' })).toBeDisabled();
    });

    it('says which pick a ticked row replaces', async () => {
      const a = option(11, { ehp: 1100 });
      const b = option(12, { ehp: 1050 });
      const s = checked(before, done({ noDownside: [a, b] }));
      renderPanel(s, vi.fn(), vi.fn(), settings(), { fitting });
      await userEvent.click(screen.getByRole('button', { name: '1 more option' }));
      const boxes = screen.getAllByRole('checkbox');
      await userEvent.click(boxes[0]);
      await userEvent.click(boxes[1]);
      expect(screen.getByText(/Replaces your pick:/)).toBeInTheDocument();
    });
  });

  describe('stats column preview', () => {
    const fitting = {
      modules: [
        { slot: 'low', slotIndex: 0, typeId: 1 },
        { slot: 'low', slotIndex: 1, typeId: 2 },
      ],
    } as unknown as Fitting;
    const withRecalc = (state: ImproveState, after: (fit: Fitting) => FittingStats) => ({
      ...search(state),
      recalc: vi.fn().mockImplementation(async (fit: Fitting) => after(fit)),
    });
    const lastDelta = (onPreview: ReturnType<typeof vi.fn>) =>
      onPreview.mock.calls[onPreview.mock.calls.length - 1]?.[0] as FittingStatsDelta | null;

    it('previews the ticked set, and clears it when everything is unticked', async () => {
      const a = option(11, { ehp: 1100 });
      const onPreview = vi.fn();
      const s = withRecalc(done({ noDownside: [a] }), () => ({ ...before, ehp: before.ehp + 500 }));
      renderPanel(s, vi.fn(), vi.fn(), settings(), { fitting, onPreview });
      await userEvent.click(screen.getByRole('checkbox'));
      await waitFor(() => expect(lastDelta(onPreview)?.changes.map((c) => c.key)).toEqual(['ehp']));
      await userEvent.click(screen.getByRole('checkbox'));
      await waitFor(() => expect(lastDelta(onPreview)).toBeNull());
    });

    it('previews a hovered row on top of the ticked set, and restores the ticked set on leave', async () => {
      const a = option(11, { ehp: 1100 });
      const b = option(21, { cpuUsed: 5 });
      const onPreview = vi.fn();
      // The hovered fold (both rows) also moves CPU; the ticked fold moves EHP alone.
      const s = withRecalc(done({ noDownside: [a, b] }), (fit) => {
        void fit;
        return { ...before, ehp: before.ehp + 500 };
      });
      s.recalc = vi
        .fn()
        .mockResolvedValueOnce({ ...before, ehp: before.ehp + 500 })
        .mockResolvedValue({ ...before, ehp: before.ehp + 500, cpuUsed: before.cpuUsed + 5 });
      renderPanel(s, vi.fn(), vi.fn(), settings(), { fitting, onPreview });
      const boxes = screen.getAllByRole('checkbox');
      await userEvent.click(boxes[0]);
      await waitFor(() => expect(lastDelta(onPreview)?.count).toBe(1));
      await userEvent.hover(boxes[1]);
      await waitFor(() =>
        expect(lastDelta(onPreview)?.changes.map((c) => c.key)).toEqual(['cpuUsed', 'ehp'])
      );
      await userEvent.unhover(boxes[1]);
      await waitFor(() => expect(lastDelta(onPreview)?.changes.map((c) => c.key)).toEqual(['ehp']));
    });

    it('clears the preview when the panel goes away', async () => {
      const a = option(11, { ehp: 1100 });
      const onPreview = vi.fn();
      const s = withRecalc(done({ noDownside: [a] }), () => ({ ...before, ehp: before.ehp + 500 }));
      const { unmount } = renderPanel(s, vi.fn(), vi.fn(), settings(), { fitting, onPreview });
      await userEvent.click(screen.getByRole('checkbox'));
      await waitFor(() => expect(lastDelta(onPreview)?.count).toBe(1));
      unmount();
      expect(lastDelta(onPreview)).toBeNull();
    });
  });
});
