import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@/i18n';
import { gameItemLookup } from '@/engine/fittings/fitCurrency';
import { loadText } from '@/engine/fittings/load';
import type { PopularFit } from '@/engine/fittings/popularFits';
import { useMarketHub } from '@/features/market/hub';
import type { PopularFitsResult } from './popularFits';
import { PopularFitsPanel, type PopularFitsSources } from './PopularFitsPanel';
import type { WorkbenchFit, WorkbenchFitsResult } from './workbenchFits';
import { resetWorkbenchCheckCache } from './workbenchHullRows';

/** The loader's catalogue: a Vexor and one gun — less than the game has. */
const TYPE_BY_NAME = new Map([
  ['vexor', { typeID: 626 }],
  ['heavy neutron blaster ii', { typeID: 3001 }],
]);
const SLOT_BY_TYPE_ID = { 3001: 'high' } as const;

const NAMES: Record<number, string> = {
  100: 'Heavy Neutron Blaster II',
  200: 'Warp Scrambler II',
  300: 'Damage Control II',
  3001: 'Heavy Neutron Blaster II',
};

const never = <T,>() => new Promise<T>(() => {});

/** Fake sources: one Vexor with a single high slot, and real EFT through the real text Load. */
function sources(overrides: Partial<PopularFitsSources> = {}): PopularFitsSources {
  return {
    workbenchFits: () => Promise.resolve({ ok: true, fits: [] }),
    gameData: () =>
      Promise.resolve({
        typeByName: TYPE_BY_NAME,
        slotByTypeId: SLOT_BY_TYPE_ID,
        hullSlots: (typeId) => (typeId === 626 ? { high: 1, medium: 4, low: 5, rig: 3 } : null),
        // Every name the game has — more than the loader's catalogue carries.
        isGameItem: gameItemLookup(['Vexor', 'Heavy Neutron Blaster II', 'Fierce Exotic Filament']),
      }),
    hubPrices: () => Promise.resolve(new Map()),
    popularFits: () => Promise.resolve({ ok: true, fits: [] }),
    loadText: (eft) =>
      loadText(eft, {
        catalog: () => Promise.resolve({ typeByName: TYPE_BY_NAME, slotByTypeId: SLOT_BY_TYPE_ID }),
        hullName: () => Promise.resolve('Vexor'),
        killmailHash: never,
        killmailVictim: never,
        eveWorkbenchEft: never,
      }),
    typeName: (typeId) => Promise.resolve(NAMES[typeId] ?? `Type ${typeId}`),
    ...overrides,
  };
}

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
  const popularFits = () =>
    result === null ? never<PopularFitsResult>() : Promise.resolve(result);
  render(
    <PopularFitsPanel
      shipTypeId={626}
      hullName="Vexor"
      onOpen={onOpen}
      sources={sources({ popularFits })}
    />
  );
  return onOpen;
}

describe('PopularFitsPanel', () => {
  it('lists each fit with its count, last seen and value, and opens one', async () => {
    const lastSeen = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const onOpen = renderPanel({
      ok: true,
      fits: [fit('a', 5, { lastSeen, value: 12_300_000 }), fit('b', 1)],
    });
    expect(await screen.findByText('5 losses')).toBeTruthy();
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
    const highs = await screen.findByRole('group', { name: 'High slots' });
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

  it('says so, without blocking anything, when zKillboard fails', async () => {
    renderPanel({ ok: false });
    expect((await screen.findByRole('status')).textContent).toMatch(/Couldn't load popular fits/);
  });

  it('shows a spinner while loading', async () => {
    renderPanel(null);
    expect(
      await screen.findByRole('status', { name: 'Loading popular fits from zKillboard…' })
    ).toBeTruthy();
  });

  it('notes when there is nothing to show', async () => {
    renderPanel({ ok: true, fits: [] });
    expect(await screen.findByText('No recent losses of this hull with a full fit.')).toBeTruthy();
  });
});

describe('PopularFitsPanel EVE Workbench tab', () => {
  const getHubPricesMock = vi.fn<PopularFitsSources['hubPrices']>();
  const workbenchFitsMock = vi.fn<PopularFitsSources['workbenchFits']>();

  beforeEach(() => {
    resetWorkbenchCheckCache();
    workbenchFitsMock.mockReset();
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

  /** The Workbench tab's sources, its stored list answering `result` (`null`: never). */
  function workbenchSources(
    result: WorkbenchFitsResult | null,
    overrides: Partial<PopularFitsSources> = {}
  ) {
    workbenchFitsMock.mockImplementation(() =>
      result === null ? never<WorkbenchFitsResult>() : Promise.resolve(result)
    );
    return sources({ workbenchFits: workbenchFitsMock, hubPrices: getHubPricesMock, ...overrides });
  }

  function openWorkbench(
    result: WorkbenchFitsResult | null,
    onOpen = vi.fn(),
    overrides: Partial<PopularFitsSources> = {}
  ) {
    render(
      <PopularFitsPanel
        shipTypeId={626}
        hullName="Vexor"
        onOpen={onOpen}
        sources={workbenchSources(result, overrides)}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: 'EVE Workbench' }));
    return onOpen;
  }

  it('starts on zKillboard and only reads Workbench once its tab is picked', () => {
    render(
      <PopularFitsPanel
        shipTypeId={626}
        hullName="Vexor"
        onOpen={vi.fn()}
        sources={workbenchSources({ ok: true, fits: [] })}
      />
    );
    expect(screen.getByRole('tab', { name: 'zKillboard', selected: true })).toBeTruthy();
    expect(workbenchFitsMock).not.toHaveBeenCalled();
  });

  it('lists fits with name and date created, no author, linking each to Workbench', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a'), wbFit('b', { name: '', authorName: '' })] });
    const link = await screen.findByRole('link', { name: 'Fit a' });
    expect(link.getAttribute('href')).toBe('https://eveworkbench.com/fit/a');
    expect(screen.getAllByText('Created: 2d ago')).toHaveLength(2);
    expect(screen.queryByText(/Saryna Dach/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Unnamed fit' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'eveworkbench.com' })).toBeTruthy();
  });

  it('Loads the picked fit from its stored EFT', async () => {
    const onOpen = openWorkbench({
      ok: true,
      fits: [wbFit('a'), wbFit('b', { eft: '[Vexor, Fit b]\nHeavy Neutron Blaster II' })],
    });
    fireEvent.click((await screen.findAllByRole('button', { name: 'Load' }))[1]);
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(onOpen.mock.calls[0][0]).toMatchObject({
      kind: 'fitting',
      fitting: { name: 'Fit b', shipTypeId: 626, modules: [{ slot: 'high', typeId: 3001 }] },
    });
  });

  it('says so when a fit will not Load', async () => {
    const onOpen = openWorkbench({ ok: true, fits: [wbFit('a', { eft: 'not a fit' })] });
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
      await screen.findByText('Nobody has published a fit for this hull on EVE Workbench yet.')
    ).toBeTruthy();
    cleanup();
    openWorkbench({ ok: false });
    expect((await screen.findByRole('status')).textContent).toMatch(
      /Couldn't reach the EVE Workbench fit list/
    );
  });

  it('lists only current fits, never an out-of-date one', async () => {
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
    expect(await screen.findByRole('link', { name: 'Fit c' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Fit a' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Fit b' })).toBeNull();
    expect(screen.queryByRole('button', { name: /out-of-date/ })).toBeNull();
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

  it('says so when every fit for the hull is out of date, rather than looking empty', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a', { eft: '[Vexor, Fit a]\nOld Gun I' })] });
    expect(
      await screen.findByText(
        "This hull's only EVE Workbench fit is out of date with today's game."
      )
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Fit a' })).toBeNull();
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
    expect(await screen.findByText('Prices: Jita, your default Trade Hub')).toBeTruthy();
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
    const row = await waitFor(() => rowOf('Fit a'));
    expect(await within(row).findByText('≥ 200M ISK')).toBeTruthy();
    expect(
      within(row).getByText('Created: 2d ago · 1 item has no sell order at Jita')
    ).toBeTruthy();
    expect(within(rowOf('Fit b')).getByText('Created: 2d ago')).toBeTruthy();
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
    await screen.findByText(/out of date with today's game/);
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
    expect(screen.getByText(/Prices: Amarr, your default Trade Hub/)).toBeTruthy();
    expect(getHubPricesMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'amarr' }),
      [626, 3001]
    );
  });

  describe('Seen on zKillboard', () => {
    /** The hull's one Popular fit: a single Heavy Neutron Blaster II, lost 4 times. */
    const SEEN: PopularFitsResult = {
      ok: true,
      fits: [
        fit('3001', 4, {
          parts: {
            hullTypeId: 626,
            modules: [{ slot: 'high', slotIndex: 0, typeId: 3001, state: 'active' }],
            drones: [],
            cargo: [],
            unresolved: [],
          },
        }),
      ],
    };
    const popularFits = () => Promise.resolve(SEEN);

    it('badges only the Workbench fits seen on zKillboard', async () => {
      openWorkbench(
        {
          ok: true,
          fits: [wbFit('a'), wbFit('b', { eft: '[Vexor, Fit b]\nHeavy Neutron Blaster II' })],
        },
        vi.fn(),
        { popularFits }
      );
      expect(
        await within(await waitFor(() => rowOf('Fit b'))).findByText(
          'Seen on zKillboard: 4 recent losses'
        )
      ).toBeTruthy();
      expect(rowOf('Fit a').textContent).not.toMatch(/Seen on zKillboard/);
    });

    it('still badges a fit carrying an item the game has but the loader cannot read (#2536)', async () => {
      openWorkbench(
        {
          ok: true,
          fits: [
            wbFit('a', {
              eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II\n\n\nFierce Exotic Filament x3',
            }),
          ],
        },
        vi.fn(),
        { popularFits }
      );
      expect(
        await within(await waitFor(() => rowOf('Fit a'))).findByText(
          'Seen on zKillboard: 4 recent losses'
        )
      ).toBeTruthy();
    });

    it('badges nothing, and warns of nothing, when zKillboard is unreachable', async () => {
      const unreachable = vi.fn(() => Promise.resolve<PopularFitsResult>({ ok: false }));
      openWorkbench(
        { ok: true, fits: [wbFit('a', { eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II' })] },
        vi.fn(),
        { popularFits: unreachable }
      );
      await screen.findByRole('link', { name: 'Fit a' });
      await waitFor(() => expect(unreachable).toHaveBeenCalledWith(626));
      expect(screen.queryByText(/Seen on zKillboard/)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
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
      expect(first.parentElement).toBe(screen.getByRole('list', { name: 'EVE Workbench' }));
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
      render(
        <div data-virtual-scroll-root style={{ overflowY: 'auto' }}>
          <PopularFitsPanel
            shipTypeId={626}
            hullName="Vexor"
            onOpen={vi.fn()}
            capped={false}
            sources={workbenchSources({ ok: true, fits: MANY })}
          />
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
      render(
        <PopularFitsPanel
          shipTypeId={626}
          hullName="Vexor"
          onOpen={vi.fn()}
          capped={false}
          sources={workbenchSources({ ok: true, fits: MANY })}
        />
      );
      fireEvent.click(screen.getByRole('tab', { name: 'EVE Workbench' }));
      await screen.findByRole('link', { name: 'Fit 80' });
      expect(loadButtons()).toHaveLength(80);
    });
  });
});
