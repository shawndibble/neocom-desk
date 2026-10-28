import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { HoldUse, TripPlan } from '@/engine/market/haulingPlan';
import type { HubJumps } from './useHubJumps';
import {
  HaulingFillList,
  HaulingTripBar,
  HaulingTripRail,
  HaulingTripSummary,
  type HaulingFillItem,
  type HaulingFillListProps,
  type HaulingTripSummaryProps,
} from './HaulingTripRail';

const hubJumps = vi.hoisted(() => ({
  calls: [] as [number | null, number | null][],
  next: null as HubJumps | null,
}));
vi.mock('./useHubJumps', () => ({
  useHubJumps: (from: number | null, to: number | null): HubJumps => {
    hubJumps.calls.push([from, to]);
    return hubJumps.next ?? { status: 'known', jumps: 45, preference: 'prefer-highsec' };
  },
}));

function plan(holds: HoldUse[], overrides: Partial<TripPlan> = {}): TripPlan {
  return {
    lines: [],
    totals: { volumeM3: 20_038, cost: 213_965_524, profit: 137_608_611, items: 20 },
    binding: 'sales',
    holds,
    ...overrides,
  };
}

const GENERAL: HoldUse[] = [{ kind: 'general', capacityM3: 64_500, usedM3: 20_038 }];

function renderSummary(
  props: Partial<HaulingTripSummaryProps> = {},
  jumps: HubJumps | null = null
) {
  hubJumps.next = jumps;
  return render(
    <MemoryRouter>
      <HaulingTripSummary
        plan={plan(GENERAL)}
        cargoSet
        laneLabel="Amarr to Jita"
        fromSystemId={30002187}
        toSystemId={30000142}
        freeM3={64_500 - 20_038}
        cargoControl={<button type="button">Mastodon</button>}
        cargoValueAfterFill={null}
        {...props}
      />
    </MemoryRouter>
  );
}

describe('HaulingTripRail', () => {
  it('shows the trip with nothing selected, and the footer under it', () => {
    render(
      <HaulingTripRail
        detail={null}
        onBack={() => {}}
        trip={<p>the trip</p>}
        footer={<p>foot</p>}
      />
    );
    expect(screen.getByText('the trip')).toBeInTheDocument();
    expect(screen.getByText('foot')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trip' })).not.toBeInTheDocument();
  });

  it('shows the detail under a "Trip" crumb that goes back, the footer still pinned', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    render(
      <HaulingTripRail
        detail={<p>the detail</p>}
        onBack={onBack}
        trip={<p>the trip</p>}
        footer={<p>foot</p>}
      />
    );
    expect(screen.getByText('the detail')).toBeInTheDocument();
    expect(screen.queryByText('the trip')).not.toBeInTheDocument();
    expect(screen.getByText('foot')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Trip' }));
    expect(onBack).toHaveBeenCalledOnce();
  });

  it('puts focus on the trip once the crumb takes the rail back', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <HaulingTripRail
        detail={<p>the detail</p>}
        onBack={() => {}}
        trip={<p>the trip</p>}
        footer={null}
      />
    );
    await user.click(screen.getByRole('button', { name: 'Trip' }));
    rerender(
      <HaulingTripRail detail={null} onBack={() => {}} trip={<p>the trip</p>} footer={null} />
    );
    expect(screen.getByText('the trip').parentElement).toHaveFocus();
  });

  it('leaves focus where it is when the detail clears from the table', () => {
    const rail = (detail: ReactNode) => (
      <HaulingTripRail detail={detail} onBack={() => {}} trip={<p>the trip</p>} footer={null} />
    );
    const { rerender } = render(
      <>
        <button type="button">row</button>
        {rail(<p>the detail</p>)}
      </>
    );
    screen.getByRole('button', { name: 'row' }).focus();
    rerender(
      <>
        <button type="button">row</button>
        {rail(null)}
      </>
    );
    expect(screen.getByRole('button', { name: 'row' })).toHaveFocus();
  });

  it('never takes focus on mount', () => {
    render(
      <HaulingTripRail detail={null} onBack={() => {}} trip={<p>the trip</p>} footer={null} />
    );
    expect(document.body).toHaveFocus();
  });

  it('scrolls back to the top when another row detail replaces this one', () => {
    const rail = (key: number) => (
      <HaulingTripRail
        detail={<p>detail {key}</p>}
        detailKey={key}
        onBack={() => {}}
        trip={null}
        footer={null}
      />
    );
    const { rerender } = render(rail(1));
    const body = screen.getByText('detail 1').parentElement!;
    body.scrollTop = 120;
    rerender(rail(2));
    expect(body.scrollTop).toBe(0);
  });
});

describe('HaulingTripSummary', () => {
  it('says nothing of the fill when it leaves the cargo value as shown', () => {
    renderSummary({ cargoValueAfterFill: 213_965_524.2 });
    expect(screen.queryByText(/with the fill/)).toBeNull();
  });

  it('reads the lane with its jumps by route preference, the free m³ with a meter, and per-jump profit', () => {
    renderSummary({ cargoValueAfterFill: 619_395_524 });
    expect(hubJumps.calls.at(-1)).toEqual([30002187, 30000142]);
    expect(screen.getByText(/Amarr to Jita ·/)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: '45 jumps (Prefer safer)' });
    const href = new URL(link.getAttribute('href') ?? '', 'http://x');
    expect(href.searchParams.get('from')).toBe('30002187');
    expect(href.searchParams.get('pref')).not.toBeNull();
    expect(href.searchParams.get('stops')).toContain('30000142');
    expect(screen.getByRole('button', { name: 'Mastodon' })).toBeInTheDocument();
    expect(screen.getByText('213,965,524', { selector: 'b' })).toBeInTheDocument();
    expect(screen.getByText('→ 619,395,524 with the fill')).toBeInTheDocument();
    expect(screen.getByText('44,462 m³')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Hold used' })).toBeInTheDocument();
    expect(screen.getByText('20,038 of 64,500 m³ used')).toBeInTheDocument();
    expect(screen.getByText('+137,608,611')).toBeInTheDocument();
    // 137,608,611 / 45
    expect(screen.getByText('Profit per jump (45)')).toBeInTheDocument();
    expect(screen.getByText('+3,057,969')).toBeInTheDocument();
    expect(
      screen.getByText("Limited by sales: some items stop at a realistic share of a week's sales.")
    ).toBeInTheDocument();
  });

  it.each([
    { status: 'loading' as const },
    { status: 'unknown' as const },
    { status: 'none' as const },
  ])('shows no jump figure and no per-jump profit while jumps are $status', ({ status }) => {
    renderSummary({}, { status });
    expect(screen.getByText('Amarr to Jita')).toBeInTheDocument();
    expect(screen.queryByText(/jumps/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText(/Profit per jump/)).not.toBeInTheDocument();
  });

  it('without a Cargo Space shows the cargo tip instead of a meter or free m³', () => {
    renderSummary({ cargoSet: false, plan: plan([], { binding: null }) });
    expect(screen.getByText('Choose your ship to size the load to your hold.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByText('free')).not.toBeInTheDocument();
    expect(screen.queryByText(/m³ used/)).not.toBeInTheDocument();
  });

  it('prints the free m³ it is given, so it matches the fill offer', () => {
    renderSummary({ freeM3: 40_000 });
    expect(screen.getByText('40,000 m³')).toBeInTheDocument();
  });

  it('reads a hold full to float residue as 0 free, not <1', () => {
    const used = 0.7 + 0.2 + 0.1;
    renderSummary({
      plan: plan([{ kind: 'general', capacityM3: 1, usedM3: used }]),
      freeM3: 1 - used,
    });
    expect(screen.getByText('0 m³')).toBeInTheDocument();
  });

  it('shows one meter per hold when the Cargo Space has several', () => {
    renderSummary({
      plan: plan([
        { kind: 'general', capacityM3: 1_000, usedM3: 400 },
        { kind: 'ammo', capacityM3: 500, usedM3: 500 },
      ]),
      freeM3: 600,
    });
    expect(
      screen.getByRole('progressbar', { name: 'Cargo hold: 400 of 1,000 cubic metres used' })
    ).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Ammo hold: 500 of 500 cubic metres used' })
    ).toBeInTheDocument();
    expect(screen.getByText('600 m³')).toBeInTheDocument();
    expect(screen.getByText('900 of 1,500 m³ used')).toBeInTheDocument();
  });
});

const ITEMS: HaulingFillItem[] = [
  {
    typeId: 1,
    name: 'Nitrogen Fuel Block',
    categoryName: 'Fuel Blocks',
    quantity: 1_800,
    volumeM3: 9_000,
    cost: 30_000_000,
    profit: 3_903_930,
  },
  {
    typeId: 2,
    name: 'Coolant',
    categoryName: 'Planetary Commodities',
    quantity: 1,
    volumeM3: 0.4,
    cost: 1_000,
    profit: 50,
  },
];

function renderFill(props: Partial<HaulingFillListProps> = {}) {
  const handlers = {
    onToggle: vi.fn(),
    onFind: vi.fn(),
    onMore: vi.fn(),
    onStop: vi.fn(),
    onAdd: vi.fn(),
  };
  const list = (more: Partial<HaulingFillListProps>) => (
    <HaulingFillList
      freeM3={44_462}
      status="ready"
      batch={0}
      runningFreeM3={null}
      reason="full"
      underMaxPrice={false}
      leftM3={120}
      canFindMore={false}
      added={null}
      items={ITEMS}
      ticked={new Set([1])}
      tickedTotals={{ count: 1, volumeM3: 9_000, cost: 30_000_000, profit: 3_903_930 }}
      holdAfter={{ usedM3: 29_038, capacityM3: 64_500, freeM3: 35_462 }}
      {...handlers}
      {...props}
      {...more}
    />
  );
  const { rerender } = render(list({}));
  return { ...handlers, update: (more: Partial<HaulingFillListProps>) => rerender(list(more)) };
}

/** The visible line, not its screen-reader copy in the live region. */
const line = (text: string | RegExp) => screen.getByText(text, { selector: 'p' });

describe('HaulingFillList', () => {
  it('brings a finished run’s result into view, then Add’s line', () => {
    const scroll = vi.fn();
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    try {
      const { update } = renderFill({ status: 'loading', batch: 1, items: [] });
      expect(scroll).not.toHaveBeenCalled();
      update({ status: 'ready' });
      expect(scroll).toHaveBeenCalledWith({ block: 'nearest' });
      scroll.mockClear();
      update({ status: 'ready', added: { count: 1, volumeM3: 9_000 } });
      expect(scroll).toHaveBeenCalledOnce();
      expect(scroll.mock.contexts[0]).toHaveTextContent(/^Added 1 item/);
    } finally {
      Element.prototype.scrollIntoView = original;
    }
  });

  it('idle: offers the scan for the free m³, and never runs it by itself', async () => {
    const user = userEvent.setup();
    const { onFind } = renderFill({ status: 'idle', items: [] });
    expect(onFind).not.toHaveBeenCalled();
    expect(screen.getByText(/items that fit the free 44,462 m³/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Find items to fill it' }));
    expect(onFind).toHaveBeenCalledOnce();
  });

  it('loading: a spinner with the batch and the room still free, the stage line, and Stop', async () => {
    const user = userEvent.setup();
    const { onStop } = renderFill({
      status: 'loading',
      batch: 3,
      runningFreeM3: 21_000,
      items: [],
      progressText: 'Reading 3 of 12 categories',
    });
    expect(screen.getByRole('status', { name: 'Batch 3 · 21,000 m³ free' })).toBeInTheDocument();
    expect(screen.getByText('Reading 3 of 12 categories')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Stop' }));
    expect(onStop).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('loading before the first batch lands: the plan’s own free m³', () => {
    renderFill({ status: 'loading', batch: 1, runningFreeM3: null, items: [] });
    expect(screen.getByRole('status', { name: 'Batch 1 · 44,462 m³ free' })).toBeInTheDocument();
  });

  it('error: what earlier batches found stays addable beside the error', async () => {
    const user = userEvent.setup();
    const { onAdd } = renderFill({ status: 'error' });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't scan for more items.");
    expect(screen.getByRole('checkbox', { name: 'Nitrogen Fuel Block' })).toBeChecked();
    await user.click(screen.getByRole('button', { name: 'Add 1 · +9,000 m³' }));
    expect(onAdd).toHaveBeenCalledOnce();
    // No stop reason: the run did not stop, it failed.
    expect(screen.queryByText('Filled: 120 m³ left.')).toBeNull();
  });

  it.each([
    ['nothing-left', 'Nothing else under your Max price is profitable on this lane.'],
    [
      'no-gain',
      'This batch found nothing profitable under your Max price; Find more checks the next items.',
    ],
    ['full', 'Filled: 120 m³ left.'],
  ] as const)('with a Max price set, says so where it matters (%s)', (reason, text) => {
    renderFill({ reason, underMaxPrice: true });
    expect(line(text)).toBeInTheDocument();
  });

  it('error: a message with a retry that carries on', async () => {
    const user = userEvent.setup();
    const { onMore, onFind } = renderFill({ status: 'error', items: [] });
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't scan for more items.");
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onMore).toHaveBeenCalledOnce();
    expect(onFind).not.toHaveBeenCalled();
  });

  it.each([
    ['full', 'Filled: 120 m³ left.'],
    ['nothing-left', 'Nothing else on this lane is profitable.'],
    ['no-gain', 'This batch found nothing profitable; Find more checks the next items.'],
    ['budget', 'Your Max spend is the limit.'],
    ['batch-cap', 'Stopped after 8 batches; press Find more to keep going.'],
    ['stopped', 'Stopped.'],
  ] as const)('ready: says why it stopped (%s)', async (reason, text) => {
    renderFill({ reason });
    expect(line(text)).toBeInTheDocument();
    // Announced too, from a region mounted before the text.
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(text));
  });

  it('offers Find more when it may find more, and it carries on', async () => {
    const user = userEvent.setup();
    const { onMore } = renderFill({ reason: 'batch-cap', canFindMore: true });
    await user.click(screen.getByRole('button', { name: 'Find more' }));
    expect(onMore).toHaveBeenCalledOnce();
  });

  it('offers no Find more when full', () => {
    renderFill({ reason: 'full', canFindMore: false });
    expect(screen.queryByRole('button', { name: 'Find more' })).toBeNull();
  });

  it('after Add: what it loaded and the room left, in place of the stop reason', () => {
    renderFill({
      items: [],
      reason: 'full',
      added: { count: 8, volumeM3: 35_850 },
      freeM3: 21_000,
      canFindMore: true,
    });
    expect(line('Added 8 items · +35,850 m³ · 21,000 m³ still free')).toBeInTheDocument();
    expect(screen.queryByText('Filled: 120 m³ left.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Find more' })).toBeInTheDocument();
  });

  it('ready with nothing found: only the reason', () => {
    renderFill({ items: [], reason: 'nothing-left' });
    expect(line('Nothing else on this lane is profitable.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('ready: one tickable row per item, whole m³, full ISK profit, and the Add totals', async () => {
    const user = userEvent.setup();
    const { onToggle, onAdd } = renderFill();
    const list = screen.getByRole('list', { name: 'Items that fit the free space' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('checkbox', { name: 'Nitrogen Fuel Block' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Coolant' })).not.toBeChecked();
    // m³ leads the line, where truncating the category can't hide it.
    expect(screen.getByText('9,000 m³')).toBeInTheDocument();
    expect(screen.getByText('· Fuel Blocks')).toHaveClass('truncate');
    expect(screen.getByText('<1 m³')).not.toHaveClass('truncate');
    expect(screen.getByText('· Planetary Commodities')).toBeInTheDocument();
    expect(screen.getByText('+3,903,930')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Coolant' }));
    expect(onToggle).toHaveBeenCalledWith(2, true);

    const add = screen.getByRole('button', { name: 'Add 1 · +9,000 m³' });
    expect(add).toHaveAccessibleDescription('+30,000,000 spend · +3,903,930 profit');
    await user.click(add);
    expect(onAdd).toHaveBeenCalledOnce();
    expect(
      screen.getByText('Hold after: 29,038 of 64,500 m³, 35,462 m³ still free.')
    ).toBeInTheDocument();
  });

  it('disables Add with nothing ticked', () => {
    renderFill({ ticked: new Set(), tickedTotals: { count: 0, volumeM3: 0, cost: 0, profit: 0 } });
    expect(screen.getByRole('button', { name: /Add 0/ })).toBeDisabled();
  });

  it('leaves out the hold-after line without a Cargo Space', () => {
    renderFill({ holdAfter: null });
    expect(screen.queryByText(/Hold after/)).not.toBeInTheDocument();
  });
});

describe('HaulingTripBar', () => {
  it('shows free m³ and profit, opens the trip, and carries the copy button', async () => {
    const user = userEvent.setup();
    const onOpenTrip = vi.fn();
    render(
      <HaulingTripBar
        freeM3={44_462}
        profit={137_608_611}
        onOpenTrip={onOpenTrip}
        copyButton={<button type="button">Copy multibuy</button>}
      />
    );
    const bar = screen.getByRole('region', { name: 'Trip' });
    expect(bar).toHaveTextContent('44,462 m³ free');
    expect(within(bar).getByRole('button', { name: 'Copy multibuy' })).toBeInTheDocument();
    expect(bar).toHaveTextContent('+137.6M');
    await user.click(within(bar).getByRole('button', { name: /Trip details/ }));
    expect(onOpenTrip).toHaveBeenCalledOnce();
  });

  it('shows no free m³ without a Cargo Space', () => {
    render(<HaulingTripBar freeM3={null} profit={0} onOpenTrip={() => {}} copyButton={null} />);
    expect(screen.getByRole('region', { name: 'Trip' })).not.toHaveTextContent('m³');
  });
});
