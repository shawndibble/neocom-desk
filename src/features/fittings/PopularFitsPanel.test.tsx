import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@/i18n';
import type { PopularFit } from '@/engine/fittings/popularFits';
import type { PopularFitsResult } from './popularFits';
import type { WorkbenchFit, WorkbenchFitsResult } from './workbenchFits';

const { usePopularFitsMock, useWorkbenchFitsMock, loadFittingFromTextMock } = vi.hoisted(() => ({
  usePopularFitsMock: vi.fn(),
  useWorkbenchFitsMock: vi.fn(),
  loadFittingFromTextMock: vi.fn(),
}));
vi.mock('./popularFits', () => ({ usePopularFits: usePopularFitsMock }));
vi.mock('./workbenchFits', () => ({
  useWorkbenchFits: useWorkbenchFitsMock,
  workbenchFitUrl: (id: string) => `https://eveworkbench.com/fit/${id}`,
}));
vi.mock('./loadFittingFromText', () => ({ loadFittingFromText: loadFittingFromTextMock }));
vi.mock('@/sde/loadSde', () => ({
  typeName: (typeId: number) =>
    Promise.resolve(
      { 100: 'Heavy Neutron Blaster II', 200: 'Warp Scrambler II', 300: 'Damage Control II' }[
        typeId
      ] ?? `Type ${typeId}`
    ),
  // The out-of-date check's game data (issue #2485): a Vexor with one high slot.
  loadFittingSlots: () => Promise.resolve({ 3001: 'high' }),
  loadShipTree: () =>
    Promise.resolve({
      ships: [{ typeID: 626, stats: { highSlots: 1, medSlots: 4, lowSlots: 5, rigSlots: 3 } }],
    }),
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

  it('lists fits with name, author and date added, linking each to Workbench', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a'), wbFit('b', { name: '', authorName: '' })] });
    const link = await screen.findByRole('link', { name: 'Fit a' });
    expect(link.getAttribute('href')).toBe('https://eveworkbench.com/fit/a');
    expect(screen.getByText('by Saryna Dach · added 2d ago')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Unnamed fit' })).toBeTruthy();
    expect(screen.getByText('by unknown pilot · added 2d ago')).toBeTruthy();
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
});
