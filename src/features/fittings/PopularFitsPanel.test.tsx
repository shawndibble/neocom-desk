import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@/i18n';
import type { PopularFit } from '@/engine/fittings/popularFits';
import type { PopularFitsResult } from './popularFits';
import type { WorkbenchFit, WorkbenchFitsResult } from './workbenchFits';

const { usePopularFitsMock, useWorkbenchFitsMock, loadFittingFromTextMock, getHubPricesMock } =
  vi.hoisted(() => ({
    usePopularFitsMock: vi.fn(),
    useWorkbenchFitsMock: vi.fn(),
    loadFittingFromTextMock: vi.fn(),
    getHubPricesMock: vi.fn(),
  }));
vi.mock('@/market/prices', () => ({ getHubPrices: getHubPricesMock }));
// The synced Default Trade Hub, as a plain store a test can switch.
vi.mock('@/features/market/hub', async () => {
  const { create } = await import('zustand');
  return {
    useMarketHub: create<{ value: string; hydrate: () => Promise<void> }>(() => ({
      value: 'jita',
      hydrate: () => Promise.resolve(),
    })),
  };
});
vi.mock('./popularFits', () => ({ usePopularFits: usePopularFitsMock }));
vi.mock('./workbenchFits', () => ({
  useWorkbenchFits: useWorkbenchFitsMock,
  workbenchFitUrl: (id: string) => `https://eveworkbench.com/fit/${id}`,
}));
vi.mock('./loadFittingFromText', () => ({ loadFittingFromText: loadFittingFromTextMock }));
// Sightings (#2486) have their own tests: WorkbenchSightingBadge.test.tsx.
vi.mock('./workbenchSightings', () => ({ useWorkbenchSightings: () => new Map() }));
vi.mock('@/sde/loadSde', () => ({
  typeName: (typeId: number) =>
    Promise.resolve(
      {
        100: 'Heavy Neutron Blaster II',
        200: 'Warp Scrambler II',
        300: 'Damage Control II',
        3001: 'Heavy Neutron Blaster II',
      }[typeId] ?? `Type ${typeId}`
    ),
  // The out-of-date check's game data (issue #2485): a Vexor with one high slot.
  loadFittingSlots: () => Promise.resolve({ 3001: 'high' }),
  loadShipTree: () =>
    Promise.resolve({
      ships: [{ typeID: 626, stats: { highSlots: 1, medSlots: 4, lowSlots: 5, rigSlots: 3 } }],
    }),
  // Every name the game has — more than the loader's catalogue below carries.
  loadGameTypeNames: () =>
    Promise.resolve(['Vexor', 'Heavy Neutron Blaster II', 'Fierce Exotic Filament']),
}));
vi.mock('@/features/skills/typeCatalog', () => ({
  loadItemNameMap: () =>
    Promise.resolve(
      new Map([
        ['vexor', { typeID: 626 }],
        ['heavy neutron blaster ii', { typeID: 3001 }],
      ])
    ),
}));

import { useMarketHub } from '@/features/market/hub';
import { PopularFitsPanel } from './PopularFitsPanel';

function fit(key: string, count: number, extra: Partial<PopularFit> = {}): PopularFit {
  return {
    key,
    count,
    lastSeen: null,
    value: null,
    killmailIds: [1],
    parts: {
      hullTypeId: 626,
      modules: [{ slot: 'high', slotIndex: 0, typeId: 100, state: 'active', chargeTypeId: 900 }],
      drones: [{ typeId: 500, quantity: 5, state: 'online' }],
      cargo: [],
      unresolved: [],
    },
    ...extra,
  };
}

function renderPanel(result: PopularFitsResult | null, onOpen = vi.fn()) {
  usePopularFitsMock.mockReturnValue(result);
  render(<PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={onOpen} />);
  return onOpen;
}

describe('PopularFitsPanel', () => {
  beforeEach(() => usePopularFitsMock.mockReset());

  it('lists each fit with its count, last seen and value, and opens one', () => {
    const lastSeen = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const onOpen = renderPanel({
      ok: true,
      fits: [fit('a', 5, { lastSeen, value: 12_300_000 }), fit('b', 1)],
    });
    expect(screen.getByText('5 losses')).toBeTruthy();
    expect(screen.getByText(/last seen 3d ago/)).toBeTruthy();
    expect(screen.getByText(/~12\.3M ISK/)).toBeTruthy();
    expect(screen.getByText('1 loss')).toBeTruthy();

    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const loaded = onOpen.mock.calls[0][0];
    expect(loaded.fitting).toMatchObject({
      name: 'Vexor popular fit 1',
      shipTypeId: 626,
      modules: [{ slot: 'high', typeId: 100, chargeTypeId: 900 }],
    });
  });

  it('groups icons by rack and names each module', async () => {
    renderPanel({
      ok: true,
      fits: [
        fit('a', 2, {
          parts: {
            hullTypeId: 626,
            modules: [
              { slot: 'high', slotIndex: 0, typeId: 100, state: 'active' },
              { slot: 'high', slotIndex: 1, typeId: 100, state: 'active' },
              { slot: 'medium', slotIndex: 0, typeId: 200, state: 'active' },
              { slot: 'low', slotIndex: 0, typeId: 300, state: 'active' },
            ],
            drones: [],
            cargo: [],
            unresolved: [],
          },
        }),
      ],
    });
    const highs = screen.getByRole('group', { name: 'High slots' });
    expect(
      await within(highs).findAllByRole('img', { name: 'Heavy Neutron Blaster II' })
    ).toHaveLength(2);
    expect(
      within(screen.getByRole('group', { name: 'Mid slots' })).getByRole('img', {
        name: 'Warp Scrambler II',
      })
    ).toBeTruthy();
    expect(
      within(screen.getByRole('group', { name: 'Low slots' })).getByRole('img', {
        name: 'Damage Control II',
      })
    ).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Rigs' })).toBeNull();
  });

  it('says so, without blocking anything, when zKillboard fails', () => {
    renderPanel({ ok: false });
    expect(screen.getByRole('status').textContent).toMatch(/Couldn't load popular fits/);
  });

  it('shows a spinner while loading', async () => {
    renderPanel(null);
    expect(
      await screen.findByRole('status', { name: 'Loading popular fits from zKillboard…' })
    ).toBeTruthy();
  });

  it('notes when there is nothing to show', () => {
    renderPanel({ ok: true, fits: [] });
    expect(screen.getByText('No recent losses of this hull with a full fit.')).toBeTruthy();
  });
});

describe('PopularFitsPanel EVE Workbench tab', () => {
  beforeEach(() => {
    usePopularFitsMock.mockReset().mockReturnValue({ ok: true, fits: [] });
    useWorkbenchFitsMock.mockReset();
    loadFittingFromTextMock.mockReset();
    getHubPricesMock.mockReset().mockResolvedValue(new Map());
    useMarketHub.setState({ value: 'jita' });
  });

  function wbFit(id: string, extra: Partial<WorkbenchFit> = {}): WorkbenchFit {
    return {
      id,
      name: `Fit ${id}`,
      authorId: 1,
      authorName: 'Saryna Dach',
      dateAdded: Date.now() - 2.5 * 86_400_000,
      eft: `[Vexor, Fit ${id}]`,
      ...extra,
    };
  }

  function openWorkbench(result: WorkbenchFitsResult | null, onOpen = vi.fn()) {
    useWorkbenchFitsMock.mockReturnValue(result);
    render(<PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={onOpen} />);
    fireEvent.click(screen.getByRole('tab', { name: 'EVE Workbench' }));
    return onOpen;
  }

  it('starts on zKillboard and only reads Workbench once its tab is picked', () => {
    render(<PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'zKillboard', selected: true })).toBeTruthy();
    expect(useWorkbenchFitsMock).not.toHaveBeenCalled();
  });

  it('lists fits with name and date added, no author, linking each to Workbench', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a'), wbFit('b', { name: '', authorName: '' })] });
    const link = await screen.findByRole('link', { name: 'Fit a' });
    expect(link.getAttribute('href')).toBe('https://eveworkbench.com/fit/a');
    expect(screen.getAllByText('added 2d ago')).toHaveLength(2);
    expect(screen.queryByText(/Saryna Dach/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Unnamed fit' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'eveworkbench.com' })).toBeTruthy();
  });

  it('Loads the picked fit from its stored EFT', async () => {
    const loaded = {
      kind: 'fitting',
      source: 'text',
      fitting: { name: 'Fit b', shipTypeId: 626, modules: [], drones: [], cargo: [] },
      unresolved: [],
    };
    loadFittingFromTextMock.mockResolvedValue(loaded);
    const onOpen = openWorkbench({ ok: true, fits: [wbFit('a'), wbFit('b')] });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Load' }))[1]);
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(loaded));
    expect(loadFittingFromTextMock).toHaveBeenCalledWith('[Vexor, Fit b]');
  });

  it('says so when a fit will not Load', async () => {
    loadFittingFromTextMock.mockResolvedValue({
      kind: 'failed',
      source: 'text',
      error: 'unrecognised',
      unresolved: [],
    });
    const onOpen = openWorkbench({ ok: true, fits: [wbFit('a')] });
    fireEvent.click(await screen.findByRole('button', { name: 'Load' }));
    expect((await screen.findByRole('alert')).textContent).toBe("Couldn't load this fit.");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('tells loading, empty and unreachable apart', async () => {
    openWorkbench(null);
    expect(
      await screen.findByRole('status', { name: 'Loading fits from EVE Workbench…' })
    ).toBeTruthy();
    cleanup();
    openWorkbench({ ok: true, fits: [] });
    expect(
      screen.getByText('Nobody has published a fit for this hull on EVE Workbench yet.')
    ).toBeTruthy();
    cleanup();
    openWorkbench({ ok: false });
    expect(screen.getByRole('status').textContent).toMatch(
      /Couldn't reach the EVE Workbench fit list/
    );
  });

  it('lists current fits first and out-of-date ones, with why, only on request', async () => {
    openWorkbench({
      ok: true,
      fits: [
        wbFit('a', { eft: '[Vexor, Fit a]\nOld Gun I' }),
        wbFit('b', {
          eft: '[Vexor, Fit b]\nHeavy Neutron Blaster II\nHeavy Neutron Blaster II',
        }),
        wbFit('c', { eft: '[Vexor, Fit c]\nHeavy Neutron Blaster II' }),
      ],
    });
    // Nothing is listed until the check lands, so an out-of-date fit never flashes up.
    expect(screen.queryByRole('link', { name: 'Fit a' })).toBeNull();
    const show = await screen.findByRole('button', { name: 'Show 2 out-of-date fits' });
    expect(screen.queryByRole('link', { name: 'Fit a' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Fit b' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Fit c' })).toBeTruthy();

    fireEvent.click(show);
    const names = screen
      .getAllByRole('link')
      .map((link) => link.textContent)
      .filter((name) => name?.startsWith('Fit '));
    expect(names).toEqual(['Fit c', 'Fit a', 'Fit b']);
    expect(screen.getByText('Out of date: uses a removed item: Old Gun I')).toBeTruthy();
    expect(screen.getByText('Out of date: this ship has fewer high slots now')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Hide out-of-date fits' })).toBeTruthy();
  });

  it('never calls an item the game still has removed, though the loader cannot read it', async () => {
    openWorkbench({
      ok: true,
      fits: [
        wbFit('a', {
          eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II\n\nFierce Exotic Filament x3',
        }),
      ],
    });
    expect(await screen.findByRole('link', { name: 'Fit a' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /out-of-date fit/ })).toBeNull();
  });

  it("shows a fit's modules by rack, from the out-of-date check's own load", async () => {
    openWorkbench({
      ok: true,
      fits: [wbFit('a', { eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II' }), wbFit('b')],
    });
    const row = (await screen.findByRole('link', { name: 'Fit a' })).closest('li');
    if (row === null) throw new Error('no row');
    const highs = within(row).getByRole('group', { name: 'High slots' });
    expect(
      await within(highs).findByRole('img', { name: 'Heavy Neutron Blaster II' })
    ).toBeTruthy();
    expect(within(row).queryByRole('group', { name: 'Mid slots' })).toBeNull();
    // A fit with nothing fitted draws no strip at all.
    const bare = screen.getByRole('link', { name: 'Fit b' }).closest('li');
    if (bare === null) throw new Error('no row');
    expect(within(bare).queryByRole('group')).toBeNull();
  });

  it('shows the modules that did load on an out-of-date fit, without the unread line', async () => {
    openWorkbench({
      ok: true,
      fits: [wbFit('a', { eft: '[Vexor, Fit a]\nOld Gun I\nHeavy Neutron Blaster II' })],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 out-of-date fit' }));
    const row = screen.getByRole('link', { name: 'Fit a' }).closest('li');
    if (row === null) throw new Error('no row');
    const highs = within(row).getByRole('group', { name: 'High slots' });
    expect(
      await within(highs).findAllByRole('img', { name: 'Heavy Neutron Blaster II' })
    ).toHaveLength(1);
    expect(within(row).queryByRole('img', { name: /Old Gun/ })).toBeNull();
  });

  it('says so when every fit for the hull is out of date, rather than looking empty', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a', { eft: '[Vexor, Fit a]\nOld Gun I' })] });
    expect(
      await screen.findByText(
        "This hull's only EVE Workbench fit is out of date with today's game."
      )
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Fit a' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 out-of-date fit' }));
    expect(screen.getByRole('link', { name: 'Fit a' })).toBeTruthy();
  });

  /** Sell-side prices by type, as `getHubPrices` answers. */
  function sellPrices(entries: Record<number, number | null>) {
    return new Map(
      Object.entries(entries).map(([typeId, sellMin]) => [
        Number(typeId),
        { sellMin, buyMax: null, sellVolume: 0, buyVolume: 0 },
      ])
    );
  }

  function rowOf(name: string) {
    const row = screen.getByRole('link', { name }).closest('li');
    if (row === null) throw new Error('no row');
    return row;
  }

  const PRICED_FITS = [
    wbFit('a', { eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II' }),
    wbFit('b', { eft: '[Vexor, Fit b]' }),
  ];

  it("prices each fit at the Default Trade Hub, with one price lookup for the hull's fits", async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 626: 200_000_000, 3001: 45_000_000 }));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    expect(
      await screen.findByText(
        'Prices: what each fit costs to buy today from sell orders at Jita, your default Trade Hub — not the loss value zKillboard reports.'
      )
    ).toBeTruthy();
    expect(within(rowOf('Fit a')).getByText('≈ 245M ISK')).toBeTruthy();
    expect(within(rowOf('Fit b')).getByText('≈ 200M ISK')).toBeTruthy();
    expect(getHubPricesMock).toHaveBeenCalledTimes(1);
    expect(getHubPricesMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jita' }),
      [626, 3001]
    );
  });

  it('marks a total partial when an item has no sell order, rather than pricing it at 0', async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 626: 200_000_000, 3001: null }));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    expect(
      await within(await waitFor(() => rowOf('Fit a'))).findByText(
        '≥ 200M ISK · 1 item has no sell order at Jita'
      )
    ).toBeTruthy();
    expect(within(rowOf('Fit b')).getByText('≈ 200M ISK')).toBeTruthy();
  });

  it('shows no price, and no error, when prices cannot load', async () => {
    getHubPricesMock.mockRejectedValue(new Error('offline'));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    await screen.findByRole('link', { name: 'Fit a' });
    await waitFor(() => expect(getHubPricesMock).toHaveBeenCalled());
    expect(screen.queryByText(/ISK/)).toBeNull();
    expect(screen.queryByText(/^Prices:/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no price for a fit with nothing for sale at the hub', async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 626: null, 3001: null }));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    await screen.findByRole('link', { name: 'Fit a' });
    await waitFor(() => expect(getHubPricesMock).toHaveBeenCalled());
    expect(screen.queryByText(/ISK/)).toBeNull();
  });

  it('prices an out-of-date fit for whatever loaded', async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 626: 200_000_000, 3001: 45_000_000 }));
    openWorkbench({
      ok: true,
      fits: [wbFit('a', { eft: '[Vexor, Fit a]\nOld Gun I\nHeavy Neutron Blaster II' })],
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Show 1 out-of-date fit' }));
    expect(await within(rowOf('Fit a')).findByText('≈ 245M ISK')).toBeTruthy();
  });

  it('says prices are on their way until they land', async () => {
    let answer: (prices: ReturnType<typeof sellPrices>) => void = () => {};
    getHubPricesMock.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    expect((await screen.findByText('Pricing fits at Jita…')).getAttribute('role')).toBe('status');
    expect(screen.queryByText(/ISK/)).toBeNull();
    act(() => answer(sellPrices({ 626: 200_000_000, 3001: 45_000_000 })));
    expect(await within(rowOf('Fit a')).findByText('≈ 245M ISK')).toBeTruthy();
    expect(screen.queryByText('Pricing fits at Jita…')).toBeNull();
  });

  it('stops saying prices are on their way when they cannot load', async () => {
    let fail: (error: Error) => void = () => {};
    getHubPricesMock.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    expect((await screen.findByText('Pricing fits at Jita…')).getAttribute('role')).toBe('status');
    act(() => fail(new Error('offline')));
    await waitFor(() => expect(screen.queryByText('Pricing fits at Jita…')).toBeNull());
  });

  it('never says prices are on their way when no fit loaded anything to price', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a', { eft: '[Gone Hull, Fit a]' })] });
    await screen.findByText(/out of date/);
    expect(screen.queryByText(/Pricing fits/)).toBeNull();
    expect(getHubPricesMock).not.toHaveBeenCalled();
  });

  it('re-prices the rows when the Default Trade Hub changes', async () => {
    getHubPricesMock.mockImplementation((hub: { id: string }) =>
      Promise.resolve(
        hub.id === 'amarr'
          ? sellPrices({ 626: 250_000_000, 3001: 50_000_000 })
          : sellPrices({ 626: 200_000_000, 3001: 45_000_000 })
      )
    );
    openWorkbench({ ok: true, fits: PRICED_FITS });
    expect(await screen.findByText('≈ 245M ISK')).toBeTruthy();
    act(() => useMarketHub.setState({ value: 'amarr' }));
    expect(await within(rowOf('Fit a')).findByText('≈ 300M ISK')).toBeTruthy();
    expect(screen.getByText(/sell orders at Amarr, your default Trade Hub/)).toBeTruthy();
    expect(getHubPricesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'amarr' }),
      [626, 3001]
    );
  });

  describe('a long list', () => {
    // jsdom does no layout: `data-virtual-scroll-root` gets a 600px viewport
    // (vitest.setup.dom.ts) and every row its ~96px estimate.
    const MANY = Array.from({ length: 80 }, (_, i) => wbFit(String(i + 1)));
    const loadButtons = () => screen.queryAllByRole('button', { name: 'Load' });

    it('mounts only the rows in view, each telling its place in the whole list', async () => {
      openWorkbench({ ok: true, fits: MANY });
      await screen.findByRole('link', { name: 'Fit 1' });
      expect(loadButtons().length).toBeGreaterThan(0);
      expect(loadButtons().length).toBeLessThan(40);
      const first = rowOf('Fit 1');
      expect(first.getAttribute('aria-posinset')).toBe('1');
      expect(first.getAttribute('aria-setsize')).toBe('80');
      expect(screen.queryByRole('link', { name: 'Fit 80' })).toBeNull();
    });

    it('reaches the last fit by scrolling the capped box', async () => {
      openWorkbench({ ok: true, fits: MANY });
      await screen.findByRole('link', { name: 'Fit 1' });
      const box = document.querySelector<HTMLElement>('[data-virtual-scroll-root]')!;
      act(() => {
        box.scrollTop = 1_000_000;
        fireEvent.scroll(box);
      });
      expect(await screen.findByRole('link', { name: 'Fit 80' })).toBeTruthy();
      expect(rowOf('Fit 80').getAttribute('aria-posinset')).toBe('80');
      expect(screen.queryByRole('link', { name: 'Fit 1' })).toBeNull();
    });

    it('uncapped, windows against the host that scrolls it', async () => {
      useWorkbenchFitsMock.mockReturnValue({ ok: true, fits: MANY });
      render(
        <div data-virtual-scroll-root style={{ overflowY: 'auto' }}>
          <PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={vi.fn()} capped={false} />
        </div>
      );
      fireEvent.click(screen.getByRole('tab', { name: 'EVE Workbench' }));
      await screen.findByRole('link', { name: 'Fit 1' });
      // The list draws no scroll box of its own.
      expect(document.querySelectorAll('[data-virtual-scroll-root]')).toHaveLength(1);
      expect(loadButtons().length).toBeLessThan(40);
      const host = document.querySelector<HTMLElement>('[data-virtual-scroll-root]')!;
      act(() => {
        host.scrollTop = 1_000_000;
        fireEvent.scroll(host);
      });
      expect(await screen.findByRole('link', { name: 'Fit 80' })).toBeTruthy();
    });

    it('uncapped with nothing but the page to scroll, lists every fit', async () => {
      useWorkbenchFitsMock.mockReturnValue({ ok: true, fits: MANY });
      render(
        <PopularFitsPanel shipTypeId={626} hullName="Vexor" onOpen={vi.fn()} capped={false} />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'EVE Workbench' }));
      await screen.findByRole('link', { name: 'Fit 80' });
      expect(loadButtons()).toHaveLength(80);
    });
  });
});
