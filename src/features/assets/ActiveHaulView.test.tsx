import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { HaulLeg } from '@/engine/route/haulPlan';
import type { RouteSafetyRow } from '@/engine/route/routeSafety';
import type { ActiveHaul } from './activeHaul';
import { ActiveHaulView } from './ActiveHaulView';

const sent = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, set: 1 }));
vi.mock('@/features/travel/sendWaypoints', () => ({ setWaypointsInGame: sent }));
vi.mock('@/app/useGrantedScopes', () => ({ useCharacterLacksEndpoints: () => false }));
vi.mock('@/stores/network', () => ({ useOnline: () => true }));

const cell = (systemId: number, name: string, security: number, ships: number, pods: number) =>
  ({
    systemId,
    name,
    security,
    band: security >= 0.5 ? 'highsec' : security > 0 ? 'lowsec' : 'nullsec',
    regionId: null,
    regionName: null,
    jumps: null,
    shipKills: ships,
    podKills: pods,
    npcKills: 0,
    chokepoint: false,
  }) satisfies RouteSafetyRow;
const legOneRows = [
  cell(1, 'Amarr', 1, 0, 0),
  cell(2, 'Ashab', 0.4, 3, 2),
  cell(3, 'Dodixie', 0.9, 0, 0),
];
vi.mock('./useHaulLegRows', () => ({
  useHaulLegRows: () => new Map([[0, { status: 'ready', rows: legOneRows }]]),
}));

const station = { systemId: 30000142, stationId: 60003760, name: 'Jita 4-4' };
const pickup = (systemId: number, stationId: number | null, name: string) => ({
  systemId,
  stationId,
  name,
});
const start = pickup(30002187, null, 'Amarr');

const legs: HaulLeg[] = [
  {
    id: 0,
    characterId: 1,
    trip: 1,
    kind: 'pickup',
    from: start,
    to: pickup(30002659, 60008494, 'Dodixie IX'),
    jumps: 4,
    m3: 80,
    locationId: 1,
  },
  {
    id: 1,
    characterId: 1,
    trip: 1,
    kind: 'delivery',
    from: pickup(30002659, 60008494, 'Dodixie IX'),
    to: station,
    jumps: 6,
    m3: 80,
    locationId: null,
  },
  {
    id: 2,
    characterId: 1,
    trip: 2,
    kind: 'pickup',
    from: station,
    to: pickup(30002659, 60008494, 'Dodixie IX'),
    jumps: 6,
    m3: 20,
    locationId: 1,
  },
];

const haul: ActiveHaul = {
  id: 'h1',
  createdAt: 1,
  capacityM3: 100,
  destination: station,
  plan: {
    sections: [{ characterId: 1, name: 'Alice', trips: 2, legs }],
    leftOut: [
      { characterId: 1, name: 'Alice', locationId: 9, place: 'Rens VI', m3: 30, reason: 'cap' },
    ],
    flown: [{ characterId: 1, name: 'Alice', ships: ['Rifter'] }],
    totals: { legs: 3, jumps: 16, m3: 100 },
  },
};

function renderView(
  onClear = vi.fn().mockResolvedValue(undefined),
  extra: Partial<ComponentProps<typeof ActiveHaulView>> = {},
  doneLegIds?: number[]
) {
  const onProgress = vi.fn();
  const onReplan = vi.fn().mockResolvedValue({ status: 'unknown' });
  render(
    <MemoryRouter>
      <ActiveHaulView
        haul={{ ...haul, doneLegIds }}
        onBack={vi.fn()}
        onClear={onClear}
        onProgress={onProgress}
        onReplan={onReplan}
        {...extra}
      />
    </MemoryRouter>
  );
  return Object.assign(onClear, { onProgress, onReplan });
}

describe('ActiveHaulView', () => {
  it('names a stack left out over the ISK limit, not a raw key', () => {
    renderView(vi.fn().mockResolvedValue(undefined), {
      haul: {
        ...haul,
        plan: {
          ...haul.plan,
          leftOut: [
            {
              characterId: 1,
              name: 'Alice',
              locationId: 9,
              place: 'Rens VI',
              m3: 4,
              reason: 'overLimit',
            },
          ],
        },
      },
    });
    expect(
      screen.getByText(/Rens VI \(Alice\): 4 m³ has units worth more than your ISK limit/)
    ).toBeTruthy();
  });

  it('summarises the route and lists every leg, repeat station included', () => {
    renderView();
    expect(screen.getByText('3 legs · 16 jumps · 100 m³ to Jita 4-4')).toBeTruthy();
    expect(screen.getAllByText(/Dodixie IX/).length).toBeGreaterThanOrEqual(3);
    expect(
      screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-leg-id'))
    ).toHaveLength(3);
  });

  it('shows every leg with its own Route Safety link, plus one for the whole route', () => {
    renderView();
    expect(screen.getAllByRole('link', { name: /Show in Route Safety, leg/ })).toHaveLength(3);
    expect(screen.getByRole('link', { name: 'Route Safety, Whole' })).toBeTruthy();
  });

  it('states the condition a leg flies through, not a verdict', () => {
    renderView();
    expect(screen.getByText('1 lowsec system')).toBeTruthy();
  });

  it('names each strip cell in a tooltip with last-hour ship and pod kills', async () => {
    renderView();
    const cells = screen.getAllByTestId('haul-strip-cell');
    expect(cells).toHaveLength(3);
    expect(
      screen.getByRole('img', { name: /3 systems, lowest security 0\.4.*kills.*3.*Pod kills: 2/ })
    ).toBeTruthy();
    await userEvent.hover(cells[1]);
    expect((await screen.findAllByText(/Pod kills, last hour: 2/)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Ship kills, last hour: 3/).length).toBeGreaterThan(0);
  });

  it('says what happens at each stop, and what is in the hold on the way there', async () => {
    renderView();
    // Leg 1 flies out empty, then loads where it ends: two lines, two places.
    expect(screen.getAllByText('Flying empty')).toHaveLength(2);
    expect(screen.getByText(/Load 80 m³/)).toBeTruthy();
    expect(screen.getByText(/Drop 80 m³/)).toBeTruthy();
    expect(screen.queryByText(/on arrival/)).toBeNull();
    // An empty hold has nothing to open; a loaded one folds until asked.
    expect(screen.queryByRole('button', { name: 'Show cargo for leg 1' })).toBeNull();
    expect(screen.queryByText('Dodixie IX: 80 m³')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Show cargo for leg 2' }));
    expect(screen.getByText('Carrying 80 m³')).toBeTruthy();
    expect(screen.getByText('Dodixie IX: 80 m³')).toBeTruthy();
  });

  it('lists the items aboard and loading where the haul has them, and folds a long tail', async () => {
    const stack = (typeId: number, quantity: number) => ({
      typeId,
      name: `Item ${typeId}`,
      quantity,
      unitM3: 1,
    });
    const stacked: HaulLeg[] = [
      { ...legs[0], stacks: [stack(34, 3200000)] },
      { ...legs[1] },
      {
        ...legs[2],
        stacks: [1, 2, 3, 4, 5, 6, 7, 8].map((id) => stack(id, 10 + id)),
      },
    ];
    renderView(undefined, {
      haul: {
        ...haul,
        plan: { ...haul.plan, sections: [{ ...haul.plan.sections[0], legs: stacked }] },
      },
    });
    // The stop the pilot is flying to opens on what to pick up there.
    expect(screen.getByText('3,200,000 × Item 34')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Show items at the end of leg 3' }));
    await userEvent.click(screen.getByRole('button', { name: 'and 2 more types' }));
    expect(screen.getByText('11 × Item 1')).toBeTruthy();
  });

  it('lists what to drop at the delivery stop, folded until asked', async () => {
    const stacked: HaulLeg[] = [
      {
        ...legs[0],
        stacks: [{ typeId: 34, name: 'Item 34', quantity: 5, unitM3: 16 }],
      },
      legs[1],
    ];
    renderView(undefined, {
      haul: {
        ...haul,
        plan: { ...haul.plan, sections: [{ ...haul.plan.sections[0], legs: stacked }] },
      },
    });
    expect(screen.getAllByText('5 × Item 34')).toHaveLength(1);
    await userEvent.click(screen.getByRole('button', { name: 'Show items at the end of leg 2' }));
    expect(screen.getAllByText('5 × Item 34')).toHaveLength(2);
    expect(screen.getByText(/Drop 80 m³/)).toBeTruthy();
  });

  it('reads a flight as take the ship, fly it out, with no hold to open', () => {
    const flight: HaulLeg[] = [
      { ...legs[0], m3: 0, ships: ['Rifter'] },
      { ...legs[1], m3: 0, ships: ['Rifter'] },
    ];
    renderView(undefined, {
      haul: {
        ...haul,
        capacityM3: 0,
        plan: {
          ...haul.plan,
          sections: [{ ...haul.plan.sections[0], legs: flight }],
          leftOut: [],
          flown: [],
          totals: { legs: 2, jumps: 10, m3: 0 },
        },
      },
    });
    expect(screen.getByText('2 legs · 10 jumps to Jita 4-4')).toBeTruthy();
    expect(screen.getByText(/Take Rifter/)).toBeTruthy();
    expect(screen.getByText('Fly Rifter to Jita 4-4')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /cargo for leg/ })).toBeNull();
  });

  it('heads each leg with what it is, so the empty trip to a pickup is named', () => {
    const flight: HaulLeg[] = [
      { ...legs[0], m3: 0, ships: ['Rifter'] },
      { ...legs[1], m3: 0, ships: ['Rifter'] },
    ];
    renderView(undefined, {
      haul: {
        ...haul,
        capacityM3: 0,
        plan: {
          ...haul.plan,
          sections: [{ ...haul.plan.sections[0], legs: flight }],
          leftOut: [],
          flown: [],
          totals: { legs: 2, jumps: 10, m3: 0 },
        },
      },
    });
    const blocks = document.querySelectorAll('[data-leg-id]');
    expect(blocks[0].textContent).toContain('Travel to Dodixie IX');
    expect(blocks[0].textContent).toContain('Take Rifter');
    expect(blocks[1].textContent).toContain('Fly Rifter to Jita 4-4');
    expect(blocks[1].textContent).not.toContain('Take Rifter');
  });

  it('heads a second pickup in a trip as a haul, since the hold is already loaded', () => {
    const second = pickup(30000142, 60003760, 'Jita IV');
    const chained: HaulLeg[] = [
      legs[0],
      { ...legs[0], id: 1, from: legs[0].to, to: second, m3: 20 },
      { ...legs[1], id: 2, from: second, m3: 100 },
    ];
    renderView(undefined, {
      haul: {
        ...haul,
        plan: {
          ...haul.plan,
          sections: [{ ...haul.plan.sections[0], legs: chained }],
          totals: { legs: 3, jumps: 14, m3: 100 },
        },
      },
    });
    const blocks = document.querySelectorAll('[data-leg-id]');
    expect(blocks[0].textContent).toContain('Travel to Dodixie IX');
    expect(blocks[1].textContent).toContain('Haul to Jita IV');
    expect(blocks[1].textContent).toContain('Load 20 m³');
  });

  it('heads a cargo leg as a trip to the load, then the haul that drops it', () => {
    renderView();
    const blocks = document.querySelectorAll('[data-leg-id]');
    expect(blocks[0].textContent).toContain('Travel to Dodixie IX');
    expect(blocks[1].textContent).toContain('Haul to Jita 4-4');
    expect(blocks[1].textContent).toContain('Drop 80 m³');
  });

  it("sets one leg's stop, or every stop of the route, as waypoints", async () => {
    renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Set waypoint, leg 1' }));
    expect(sent).toHaveBeenLastCalledWith(1, [60008494]);
    await userEvent.click(screen.getByRole('button', { name: 'Set All Waypoints' }));
    expect(sent).toHaveBeenLastCalledWith(1, [60008494, 60003760, 60008494]);
  });

  it('links the first leg to Route Safety with its station-tagged stop', () => {
    renderView();
    const link = screen.getByRole('link', { name: 'Show in Route Safety, leg 1' });
    const params = new URL(link.getAttribute('href')!, 'http://x').searchParams;
    expect(params.get('from')).toBe('30002187');
    expect(params.get('stops')).toBe('30002659:60008494');
  });

  it('says what the cap left out and which ships are flown', () => {
    renderView();
    expect(screen.getByText(/Rens VI \(Alice\): 30 m³ is past the ten-stop limit/)).toBeTruthy();
    expect(screen.getByText(/Alice flies out: Rifter/)).toBeTruthy();
  });

  it('clears only after a confirm', async () => {
    const onClear = renderView();
    await userEvent.click(screen.getByRole('button', { name: 'Clear haul' }));
    expect(onClear).not.toHaveBeenCalled();
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(
      screen.getAllByRole('button', { name: 'Clear haul' }).find((b) => dialog.contains(b))!
    );
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('ticks a leg done with an Undo toast', async () => {
    const view = renderView();
    await userEvent.click(screen.getByRole('checkbox', { name: 'Leg 2 done' }));
    expect(view.onProgress).toHaveBeenCalledWith([0, 1]);
    expect((await screen.findAllByText('Marked leg 2 done')).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(view.onProgress).toHaveBeenLastCalledWith([]);
  });

  it('unticks a leg and the ones after it', async () => {
    const view = renderView(undefined, {}, [0, 1, 2]);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Leg 2 done' }));
    expect(view.onProgress).toHaveBeenCalledWith([0]);
  });

  it('keeps done legs in the list and opens the next one’s cargo', () => {
    renderView(undefined, {}, [0]);
    const rows = screen.getAllByRole('listitem').filter((li) => li.hasAttribute('data-leg-id'));
    expect(rows).toHaveLength(3);
    expect(rows[0].hasAttribute('data-done')).toBe(true);
    expect(rows[1].hasAttribute('data-done')).toBe(false);
    expect(screen.getByRole('button', { name: 'Hide cargo for leg 2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show cargo for leg 1' })).toBeNull();
    expect(screen.getByText('2 legs · 12 jumps · 20 m³ to Jita 4-4')).toBeTruthy();
  });

  it('asks before marking when the Current System is where the next leg ends', async () => {
    const view = renderView(undefined, { currentSystemId: 30002659 });
    expect(screen.getByText(/where leg 1 ends \(Dodixie IX\)/)).toBeTruthy();
    expect(view.onProgress).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Mark done' }));
    expect(view.onProgress).toHaveBeenCalledWith([0]);
  });

  it('does not ask when the Current System is elsewhere', () => {
    renderView(undefined, { currentSystemId: 30000142 });
    expect(screen.queryByRole('button', { name: 'Mark done' })).toBeNull();
  });

  it('warns that stock may look stale once every leg is done', () => {
    renderView(undefined, {}, [0, 1, 2]);
    expect(screen.getByText(/may show the old stock until ESI refreshes/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Replan from here' })).toBeNull();
  });

  it('resets progress and replans only on ask', async () => {
    const view = renderView(undefined, {}, [0, 1]);
    expect(view.onReplan).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Replan from here' }));
    expect(view.onReplan).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/Could not replan/)).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Reset progress' }));
    expect(view.onProgress).toHaveBeenCalledWith([]);
  });

  it('says who still carries a load when a replan is refused', async () => {
    const onReplan = vi.fn().mockResolvedValue({ status: 'loaded', names: ['Alice'] });
    renderView(undefined, { onReplan }, [0]);
    await userEvent.click(screen.getByRole('button', { name: 'Replan from here' }));
    expect(await screen.findByText(/Alice still carries a load/)).toBeTruthy();
  });
});
