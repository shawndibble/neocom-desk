import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { EngineSkill, TrainedSkill } from '@/engine/types';
import { gameItemLookup } from '@/engine/fittings/fitCurrency';
import { loadText } from '@/engine/fittings/load';
import type { PopularFit } from '@/engine/fittings/popularFits';
import { useMarketHub } from '@/features/market/hub';
import { useCloneStates } from '@/features/skills/cloneState';
import { useActiveCharacter } from '@/stores/activeCharacter';
import type { PopularFitsResult } from './popularFits';
import { PopularFitsPanel, type PopularFitsSources } from './PopularFitsPanel';
import type { WorkbenchFit, WorkbenchFitsResult } from './workbenchFits';
import { resetWorkbenchCheckCache } from './workbenchHullRows';

/**
 * The skill schedule behind a missing verdict's training time and its inline
 * list: none by default (no times, "Missing N skills"); a test that needs the
 * times sets `planData.catalog`.
 */
const planData = vi.hoisted(() => ({
  catalog: null as { engineSkills: ReadonlyMap<number, EngineSkill> } | null,
  trained: new Map() as ReadonlyMap<number, TrainedSkill>,
}));
vi.mock('@/features/skills/planner/usePlanEditorData', () => {
  const attributes = { intelligence: 20, memory: 20, perception: 20, willpower: 20, charisma: 19 };
  const implants = {};
  return {
    usePlanEditorData: () => ({
      catalog: planData.catalog,
      trainedSkills: planData.trained,
      trainedSkillsKnown: true,
      attributes,
      implants,
    }),
  };
});
vi.mock('@/features/skills/useTargetPlan', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTargetPlan: () => ({
    plans: [],
    targetPlanId: null,
    setTargetPlanId: vi.fn(),
    addEntries: vi.fn(),
    removeEntries: vi.fn(),
  }),
}));

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

const CRUISERS = 3335;
const GUNNERY = 3300;
const DRONES = 3436;
/** Hull, the zKillboard fit's gun and drone, and the Workbench fit's gun; the charge needs nothing. */
const REQUIREMENTS = new Map([
  [626, [{ skillTypeID: CRUISERS, level: 1 }]],
  [100, [{ skillTypeID: GUNNERY, level: 5 }]],
  [500, [{ skillTypeID: DRONES, level: 1 }]],
  [900, []],
  [3001, [{ skillTypeID: GUNNERY, level: 5 }]],
]);
const ALL_TRAINED = new Map([
  [CRUISERS, 1],
  [GUNNERY, 5],
  [DRONES, 1],
]);

const engineSkill = (typeID: number, name: string): EngineSkill => ({
  typeID,
  name,
  rank: 1,
  primary: 'perception',
  secondary: 'willpower',
  prereqs: [],
  alphaMaxLevel: 4,
});
/** The skill catalog the training times and the inline missing-skills list read. */
const SKILL_CATALOG = {
  engineSkills: new Map([
    [CRUISERS, engineSkill(CRUISERS, 'Gallente Cruiser')],
    [GUNNERY, engineSkill(GUNNERY, 'Gunnery')],
    [DRONES, engineSkill(DRONES, 'Drones')],
  ]),
};

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
    skillLevels: () => Promise.resolve(ALL_TRAINED),
    requirements: () => Promise.resolve(REQUIREMENTS),
    skills: () =>
      Promise.resolve(
        new Map([
          [CRUISERS, { alphaMaxLevel: 4, name: 'Gallente Cruiser' }],
          [GUNNERY, { alphaMaxLevel: 4, name: 'Gunnery' }],
          [DRONES, { alphaMaxLevel: 4, name: 'Drones' }],
        ])
      ),
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

/** A row's card, the clickable body: the list's `li` holds the row box, which holds the card. */
const cardOf = (row: HTMLElement) => row.firstElementChild!.firstElementChild!;

/** A price figure is `IskAmount` inside a sentence: the figure, its hidden exact value, then the unit. */
const priceBeside = (
  scope: ReturnType<typeof within> | typeof screen,
  figure: string,
  lead: string
) => {
  const parent = scope.getByText(figure).parentElement!;
  expect(parent.textContent).toContain(lead + figure);
  expect(parent.textContent?.endsWith(' ISK')).toBe(true);
};

describe('PopularFitsPanel', () => {
  it('lists each fit with its count, last seen and value, and opens one', async () => {
    const lastSeen = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const onOpen = renderPanel({
      ok: true,
      fits: [fit('a', 5, { lastSeen, value: 12_300_000 }), fit('b', 1)],
    });
    expect(await screen.findByText('5 losses')).toBeTruthy();
    expect(screen.getByText(/last seen 3d ago/)).toBeTruthy();
    priceBeside(screen, '12.3M', '~');
    expect(screen.getByText('1 loss')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '5 losses' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
    const loaded = onOpen.mock.calls[0][0];
    expect(loaded.fitting).toMatchObject({
      name: 'Vexor popular fit 1',
      shipTypeId: 626,
      modules: [{ slot: 'high', typeId: 100, chargeTypeId: 900 }],
    });
  });

  it('opens from a click anywhere on the card, a module icon included, with a mouse', async () => {
    const onOpen = renderPanel({ ok: true, fits: [fit('a', 5)] });
    const row = (await screen.findByText('5 losses')).closest('li')!;
    fireEvent.click(within(row).getAllByRole('img')[0]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    fireEvent.click(cardOf(row));
    expect(onOpen).toHaveBeenCalledTimes(2);
  });

  it('under a finger, a tap on a module icon names it instead of opening the card', async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({ ...matchMedia(query), matches: query === '(pointer: coarse)' }) as MediaQueryList;
    try {
      const onOpen = renderPanel({ ok: true, fits: [fit('a', 5)] });
      const row = (await screen.findByText('5 losses')).closest('li')!;
      fireEvent.click(within(row).getAllByRole('img')[0]);
      expect(onOpen).not.toHaveBeenCalled();
      fireEvent.click(cardOf(row));
      expect(onOpen).toHaveBeenCalledTimes(1);
    } finally {
      window.matchMedia = matchMedia;
    }
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
    // Each rack leads with its initial, hidden from screen readers (the group names it).
    const initial = highs.querySelector('[aria-hidden]:not(.absolute)')!;
    expect(initial.textContent).toBe('H');
  });

  it('says so, without blocking anything, when zKillboard fails', async () => {
    renderPanel({ ok: false, reason: 'http' });
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

describe('PopularFitsPanel EVE Workbench guides', () => {
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

  /** The panel's sources, the Workbench stored list answering `result` (`null`: never). */
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
    return onOpen;
  }

  it('loads both sources at once into one list, and the source filter narrows it', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a')] }, vi.fn(), {
      popularFits: () => Promise.resolve({ ok: true, fits: [fit('x', 5), fit('y', 1)] }),
    });
    expect(workbenchFitsMock).toHaveBeenCalledWith(626);
    const list = await screen.findByRole('list', { name: 'Popular fits' });
    await within(list).findByText('Fit a');
    expect(within(list).getByText('5 losses')).toBeTruthy();
    expect(within(list).getByText('1 loss')).toBeTruthy();
    // Each row says where it came from.
    expect(within(rowOf('Fit a')).getByText('Guide')).toBeTruthy();
    expect(within(rowOf('5 losses')).getByText('Loss')).toBeTruthy();

    const source = screen.getByRole('group', { name: 'Fit source' });
    const all = within(source).getByRole('button', { name: 'All 3' });
    expect(all.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(source).getByRole('button', { name: 'Guides 1' }));
    expect(screen.getByText('Fit a')).toBeTruthy();
    expect(screen.queryByText('5 losses')).toBeNull();
    fireEvent.click(within(source).getByRole('button', { name: 'Seen in losses 2' }));
    expect(screen.getByText('5 losses')).toBeTruthy();
    expect(screen.getByText('1 loss')).toBeTruthy();
    expect(screen.queryByText('Fit a')).toBeNull();
  });

  it("shows each source's status line only while the filter includes it", async () => {
    openWorkbench({ ok: true, fits: [] });
    expect(await screen.findByText('No recent losses of this hull with a full fit.')).toBeTruthy();
    expect(
      await screen.findByText('Nobody has published a fit for this hull on EVE Workbench yet.')
    ).toBeTruthy();
    const source = screen.getByRole('group', { name: 'Fit source' });
    fireEvent.click(within(source).getByRole('button', { name: 'Guides 0' }));
    expect(screen.queryByText('No recent losses of this hull with a full fit.')).toBeNull();
    expect(
      screen.getByText('Nobody has published a fit for this hull on EVE Workbench yet.')
    ).toBeTruthy();
    fireEvent.click(within(source).getByRole('button', { name: 'Seen in losses 0' }));
    expect(screen.getByText('No recent losses of this hull with a full fit.')).toBeTruthy();
    expect(
      screen.queryByText('Nobody has published a fit for this hull on EVE Workbench yet.')
    ).toBeNull();
  });

  it('lists the newest first across both sources, and Most seen by losses', async () => {
    const day = 86_400_000;
    openWorkbench({ ok: true, fits: [wbFit('a', { dateAdded: Date.now() - 2 * day })] }, vi.fn(), {
      popularFits: () =>
        Promise.resolve({
          ok: true,
          fits: [
            fit('many', 9, { lastSeen: new Date(Date.now() - 5 * day).toISOString() }),
            fit('few', 2, { lastSeen: new Date(Date.now() - day).toISOString() }),
          ],
        }),
    });
    const list = await screen.findByRole('list', { name: 'Popular fits' });
    await within(list).findByText('Fit a');
    const titles = () =>
      within(list)
        .getAllByRole('listitem')
        .map((item) => within(item).getAllByRole('button')[0].textContent);
    expect(titles()).toEqual(['2 losses', 'Fit a', '9 losses']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sort' }), {
      target: { value: 'seen' },
    });
    expect(titles()).toEqual(['9 losses', '2 losses', 'Fit a']);
  });

  it('lists fits with name and date created, no author, each name a Load button', async () => {
    openWorkbench({ ok: true, fits: [wbFit('a'), wbFit('b', { name: '', authorName: '' })] });
    expect(await screen.findByText('Fit a')).toBeTruthy();
    expect(screen.getAllByText(/created 2d ago/)).toHaveLength(2);
    expect(screen.queryByText(/Saryna Dach/)).toBeNull();
    expect(screen.getByText('Unnamed fit')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /^eveworkbench\.com/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Unnamed fit' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Open' })).toBeNull();
  });

  it('Loads the picked fit from its stored EFT', async () => {
    const onOpen = openWorkbench({
      ok: true,
      fits: [wbFit('a'), wbFit('b', { eft: '[Vexor, Fit b]\nHeavy Neutron Blaster II' })],
    });
    await screen.findByText('Fit b');
    fireEvent.click(openFor('Fit b'));
    await waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1));
    expect(onOpen.mock.calls[0][0]).toMatchObject({
      kind: 'fitting',
      fitting: { name: 'Fit b', shipTypeId: 626, modules: [{ slot: 'high', typeId: 3001 }] },
    });
  });

  it('says so when a fit will not Load', async () => {
    const onOpen = openWorkbench({ ok: true, fits: [wbFit('a', { eft: 'not a fit' })] });
    await screen.findByText('Fit a');
    fireEvent.click(openFor('Fit a'));
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
    expect(await screen.findByText(/Couldn't reach the EVE Workbench fit list/)).toBeTruthy();
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
    expect(screen.queryByText(/^Fit a/)).toBeNull();
    expect(await screen.findByText(/^Fit c/)).toBeTruthy();
    expect(screen.queryByText(/^Fit a/)).toBeNull();
    expect(screen.queryByText(/^Fit b/)).toBeNull();
    expect(screen.queryByText(/out-of-date/)).toBeNull();
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
    expect(await screen.findByText(/^Fit a/)).toBeTruthy();
  });

  it("shows a fit's modules by rack, from the out-of-date check's own load", async () => {
    openWorkbench({
      ok: true,
      fits: [wbFit('a', { eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II' }), wbFit('b')],
    });
    const row = (await screen.findByText(/^Fit a/)).closest('li');
    if (row === null) throw new Error('no row');
    const highs = within(row).getByRole('group', { name: 'High slots' });
    expect(
      await within(highs).findByRole('img', { name: 'Heavy Neutron Blaster II' })
    ).toBeTruthy();
    expect(within(row).queryByRole('group', { name: 'Mid slots' })).toBeNull();
    // A fit with nothing fitted draws no strip at all.
    const bare = screen.getByText(/^Fit b/).closest('li');
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
    expect(screen.queryByText(/^Fit a/)).toBeNull();
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
    const row = screen.getByText(name).closest('li');
    if (row === null) throw new Error('no row');
    return row;
  }

  /** A row's title button: the blue name is the card's keyboard control. */
  const openFor = (name: string) => within(rowOf(name)).getByRole('button', { name });

  const PRICED_FITS = [
    wbFit('a', { eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II' }),
    wbFit('b', { eft: '[Vexor, Fit b]' }),
  ];

  it("prices each fit at the Default Trade Hub, with one price lookup for the hull's fits", async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 626: 200_000_000, 3001: 45_000_000 }));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    await screen.findByText('245M');
    priceBeside(within(rowOf('Fit a')), '245M', '~');
    priceBeside(within(rowOf('Fit b')), '200M', '~');
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
    await within(row).findByText('200M');
    priceBeside(within(row), '200M', '≥ ');
    expect(within(row).getByText('1 item has no sell order at Jita')).toBeTruthy();
    expect(within(rowOf('Fit b')).getByText(/created 2d ago/)).toBeTruthy();
    priceBeside(within(rowOf('Fit b')), '200M', '~');
  });

  it('shows no price, and no error, when prices cannot load', async () => {
    getHubPricesMock.mockRejectedValue(new Error('offline'));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    await screen.findByText(/^Fit a/);
    await waitFor(() => expect(getHubPricesMock).toHaveBeenCalled());
    expect(screen.queryByText(/ISK/)).toBeNull();
    expect(screen.queryByText(/^Prices:/)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no price for a fit with nothing for sale at the hub', async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 626: null, 3001: null }));
    openWorkbench({ ok: true, fits: PRICED_FITS });
    await screen.findByText(/^Fit a/);
    await waitFor(() => expect(getHubPricesMock).toHaveBeenCalled());
    expect(screen.queryByText(/ISK/)).toBeNull();
  });

  it('never prices an out-of-date fit, since it is never listed', async () => {
    getHubPricesMock.mockResolvedValue(sellPrices({ 3001: 45_000_000 }));
    openWorkbench({
      ok: true,
      fits: [wbFit('a', { eft: '[Vexor, Fit a]\nOld Gun I\nHeavy Neutron Blaster II' })],
    });
    await screen.findByText(/out of date with today's game/);
    expect(screen.queryByText(/Pricing fits|Prices:/)).toBeNull();
    expect(getHubPricesMock).not.toHaveBeenCalled();
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
    await screen.findByText('245M');
    priceBeside(screen, '245M', '~');
    act(() => useMarketHub.setState({ value: 'amarr' }));
    await within(rowOf('Fit a')).findByText('300M');
    priceBeside(within(rowOf('Fit a')), '300M', '~');
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
      const unreachable = vi.fn(() =>
        Promise.resolve<PopularFitsResult>({ ok: false, reason: 'http' })
      );
      openWorkbench(
        { ok: true, fits: [wbFit('a', { eft: '[Vexor, Fit a]\nHeavy Neutron Blaster II' })] },
        vi.fn(),
        { popularFits: unreachable }
      );
      await screen.findByText(/^Fit a/);
      await waitFor(() => expect(unreachable).toHaveBeenCalledWith(626));
      expect(screen.queryByText(/Seen on zKillboard/)).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('a long list', () => {
    // jsdom does no layout: `data-virtual-scroll-root` gets a 600px viewport
    // (vitest.setup.dom.ts) and every row its ~96px estimate.
    const MANY = Array.from({ length: 80 }, (_, i) => wbFit(String(i + 1)));
    const loadButtons = () => screen.queryAllByText(/^Fit \d+$/);

    it('mounts only the rows in view, each telling its place in the whole list', async () => {
      openWorkbench({ ok: true, fits: MANY });
      await screen.findByText('Fit 1');
      expect(loadButtons().length).toBeGreaterThan(0);
      expect(loadButtons().length).toBeLessThan(40);
      const first = rowOf('Fit 1');
      expect(first.getAttribute('aria-posinset')).toBe('1');
      expect(first.getAttribute('aria-setsize')).toBe('80');
      expect(first.parentElement).toBe(screen.getByRole('list', { name: 'Popular fits' }));
      expect(screen.queryByText('Fit 80')).toBeNull();
    });

    it('reaches the last fit by scrolling the capped box', async () => {
      openWorkbench({ ok: true, fits: MANY });
      await screen.findByText('Fit 1');
      const box = document.querySelector<HTMLElement>('[data-virtual-scroll-root]')!;
      act(() => {
        box.scrollTop = 1_000_000;
        fireEvent.scroll(box);
      });
      expect(await screen.findByText(/^Fit 80/)).toBeTruthy();
      expect(rowOf('Fit 80').getAttribute('aria-posinset')).toBe('80');
      expect(screen.queryByText('Fit 1')).toBeNull();
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
      await screen.findByText('Fit 1');
      // The list draws no scroll box of its own.
      expect(document.querySelectorAll('[data-virtual-scroll-root]')).toHaveLength(1);
      expect(loadButtons().length).toBeLessThan(40);
      const host = document.querySelector<HTMLElement>('[data-virtual-scroll-root]')!;
      act(() => {
        host.scrollTop = 1_000_000;
        fireEvent.scroll(host);
      });
      expect(await screen.findByText(/^Fit 80/)).toBeTruthy();
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
      await screen.findByText(/^Fit 80/);
      expect(loadButtons()).toHaveLength(80);
    });
  });
});

describe('Popular fits can-fly verdicts', () => {
  beforeEach(() => {
    resetWorkbenchCheckCache();
    useMarketHub.setState({ value: 'jita' });
  });
  afterEach(() => {
    useActiveCharacter.setState({ activeCharacterId: null });
    useCloneStates.setState({ value: {} });
    planData.catalog = null;
    planData.trained = new Map();
  });

  /** In a router: the inline missing-skills list links each skill. */
  const renderInRouter = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>);

  const renderWith = (overrides: Partial<PopularFitsSources>, onOpen = vi.fn()) => {
    renderInRouter(
      <PopularFitsPanel
        shipTypeId={626}
        hullName="Vexor"
        onOpen={onOpen}
        sources={sources({
          popularFits: () => Promise.resolve({ ok: true, fits: [fit('a', 12)] }),
          ...overrides,
        })}
      />
    );
    return onOpen;
  };

  it('says where the fits come from', () => {
    renderWith({});
    expect(screen.getByRole('heading', { name: 'Start from a proven fit' })).toBeTruthy();
    expect(screen.getByText('Click a fit to open it in the editor.')).toBeTruthy();
    // The sources are named in the heading's info tooltip.
    expect(screen.getByRole('button', { name: 'Where these fits come from' })).toBeTruthy();
  });

  it('offers Can fly now only with a Character', async () => {
    renderWith({});
    await screen.findByText('12 losses');
    expect(screen.queryByRole('checkbox', { name: /Can fly now/ })).toBeNull();
  });

  it('shows no verdict with no Character', async () => {
    renderWith({});
    await screen.findByText('12 losses');
    expect(screen.queryByTestId('popular-fit-verdict')).toBeNull();
  });

  it('ends a fit the Character can fly with Can fly', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    renderWith({});
    const row = (await screen.findByText('12 losses')).closest('li')!;
    expect((await within(row).findByTestId('popular-fit-verdict')).textContent).toBe('Can fly');
  });

  it('counts the missing skills across hull, modules and drones, Omega only for an Alpha', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    useCloneStates.setState({ value: { 7: 'alpha' } });
    renderWith({ skillLevels: () => Promise.resolve(new Map([[CRUISERS, 1]])) });
    const row = (await screen.findByText('12 losses')).closest('li')!;
    expect((await within(row).findByTestId('popular-fit-verdict')).textContent).toBe(
      'Missing 2 skills · Omega only'
    );
  });

  it('counts the missing skills and tints the modules the pilot cannot use', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    renderWith({ skillLevels: () => Promise.resolve(new Map([[CRUISERS, 1]])) });
    const row = (await screen.findByText('12 losses')).closest('li')!;
    expect((await within(row).findByTestId('popular-fit-verdict')).textContent).toBe(
      'Missing 2 skills'
    );
    const gun = within(row).getByRole('img', {
      name: 'Heavy Neutron Blaster II\nCan’t use: missing skills',
    });
    expect(gun.hasAttribute('data-cant-use')).toBe(true);
  });

  it('tints no module the pilot can use', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    renderWith({});
    const row = (await screen.findByText('12 losses')).closest('li')!;
    await within(row).findByTestId('popular-fit-verdict');
    expect(row.querySelector('[data-cant-use]')).toBeNull();
  });

  it("shows no verdict when the pilot's skills could not be read", async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    renderWith({ skillLevels: () => Promise.reject(new Error('skills unknown')) });
    await screen.findByText('12 losses');
    await act(async () => {});
    expect(screen.queryByTestId('popular-fit-verdict')).toBeNull();
  });

  it('never reads a fit with an unreadable type as flyable', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    const partial = new Map(REQUIREMENTS);
    partial.delete(500);
    renderWith({ requirements: () => Promise.resolve(partial) });
    const row = (await screen.findByText('12 losses')).closest('li')!;
    expect((await within(row).findByTestId('popular-fit-verdict')).textContent).toBe(
      'Skills unknown'
    );
  });

  it('gives each EVE Workbench fit its verdict too', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    const workbenchFit: WorkbenchFit = {
      id: 'w',
      name: 'Rail Vexor',
      authorId: 1,
      authorName: 'Saryna Dach',
      dateAdded: Date.now(),
      eft: '[Vexor, Rail Vexor]\nHeavy Neutron Blaster II',
    };
    renderWith({
      workbenchFits: () => Promise.resolve({ ok: true, fits: [workbenchFit] }),
      skillLevels: () => Promise.resolve(new Map([[CRUISERS, 1]])),
    });
    const row = (await screen.findByText('Rail Vexor')).closest('li')!;
    expect((await within(row).findByTestId('popular-fit-verdict')).textContent).toBe(
      'Missing 1 skill'
    );
  });

  it('opens the missing skills under the row from the verdict, without opening the fit', async () => {
    useActiveCharacter.setState({ activeCharacterId: 7 });
    planData.catalog = SKILL_CATALOG;
    planData.trained = new Map([[CRUISERS, { level: 1, sp: 250 }]]);
    const onOpen = renderWith({ skillLevels: () => Promise.resolve(new Map([[CRUISERS, 1]])) });
    const row = (await screen.findByText('12 losses')).closest('li')!;
    // With the skill schedule read, the verdict tells the training time.
    const verdict = await within(row).findByRole('button', { name: /^2 skills · / });
    expect(verdict.getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByRole('link', { name: 'Gunnery' })).toBeNull();

    fireEvent.click(verdict);
    expect(onOpen).not.toHaveBeenCalled();
    expect(verdict.getAttribute('aria-expanded')).toBe('true');
    expect(within(row).getByRole('link', { name: 'Gunnery' })).toBeTruthy();
    expect(within(row).getByRole('link', { name: 'Drones' })).toBeTruthy();

    fireEvent.click(verdict);
    expect(verdict.getAttribute('aria-expanded')).toBe('false');
    expect(within(row).queryByRole('link', { name: 'Gunnery' })).toBeNull();
  });

  describe('Can fly now', () => {
    /** Fit a needs Gunnery V; fit b (a charge-only module and the drones) needs nothing missing. */
    const FITS: PopularFitsResult = {
      ok: true,
      fits: [
        fit('a', 12),
        fit('b', 3, {
          parts: {
            hullTypeId: 626,
            modules: [{ slot: 'high', slotIndex: 0, typeId: 900, state: 'active' }],
            drones: [{ typeId: 500, quantity: 5, state: 'online' }],
            cargo: [],
            unresolved: [],
          },
        }),
      ],
    };

    it('keeps only the fits the Character can fly, with the count', async () => {
      useActiveCharacter.setState({ activeCharacterId: 7 });
      renderWith({
        popularFits: () => Promise.resolve(FITS),
        skillLevels: () =>
          Promise.resolve(
            new Map([
              [CRUISERS, 1],
              [DRONES, 1],
            ])
          ),
      });
      const flyNow = await screen.findByRole('checkbox', { name: /^Can fly now/ });
      await waitFor(() => expect(flyNow.closest('label')!.textContent).toBe('Can fly now1/2'));
      expect(screen.getByText('12 losses')).toBeTruthy();
      fireEvent.click(flyNow);
      expect(screen.getByText('3 losses')).toBeTruthy();
      expect(screen.queryByText('12 losses')).toBeNull();
    });

    it('says so when the Character can fly none, and Show all fits brings them back', async () => {
      useActiveCharacter.setState({ activeCharacterId: 7 });
      renderWith({
        popularFits: () => Promise.resolve(FITS),
        skillLevels: () => Promise.resolve(new Map([[CRUISERS, 1]])),
      });
      const flyNow = await screen.findByRole('checkbox', { name: /^Can fly now/ });
      await waitFor(() => expect(flyNow.closest('label')!.textContent).toBe('Can fly now0/2'));
      fireEvent.click(flyNow);
      expect(screen.getByText("You can't fly any of these 2 fits yet.")).toBeTruthy();
      expect(screen.queryByRole('list', { name: 'Popular fits' })).toBeNull();
      // No training times known: no closest fit to offer.
      expect(screen.queryByRole('button', { name: 'Show the closest' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Show all fits' }));
      expect(screen.getByText('12 losses')).toBeTruthy();
      expect(screen.getByText('3 losses')).toBeTruthy();
      expect((flyNow as HTMLInputElement).checked).toBe(false);
    });

    it('names the closest fit, and Show the closest opens its missing skills', async () => {
      useActiveCharacter.setState({ activeCharacterId: 7 });
      planData.catalog = SKILL_CATALOG;
      planData.trained = new Map([[CRUISERS, { level: 1, sp: 250 }]]);
      renderWith({
        popularFits: () => Promise.resolve(FITS),
        skillLevels: () => Promise.resolve(new Map([[CRUISERS, 1]])),
      });
      const flyNow = await screen.findByRole('checkbox', { name: /^Can fly now/ });
      await waitFor(() => expect(flyNow.closest('label')!.textContent).toBe('Can fly now0/2'));
      fireEvent.click(flyNow);
      // Fit b lacks only Drones I; fit a lacks Gunnery V too.
      expect(screen.getByText(/^Closest: the fit seen in 3 losses, /)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Show the closest' }));
      expect((screen.getByRole('combobox', { name: 'Sort' }) as HTMLSelectElement).value).toBe(
        'training'
      );
      const row = screen.getByText('3 losses').closest('li')!;
      expect(within(row).getByRole('button', { expanded: true })).toBeTruthy();
      expect(within(row).getByRole('link', { name: 'Drones' })).toBeTruthy();
    });
  });
});
