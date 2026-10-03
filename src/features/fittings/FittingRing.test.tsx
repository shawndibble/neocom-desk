import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { HardpointKind } from '@/engine/fittings/hardpoints';
import type { Fitting, FittingStats } from '@/engine/fittings/types';
import { neutralExtendedStats } from '@/engine/fittings/__fixtures__/fittingStats';
import { FakeItemActions } from '@/features/market/__fixtures__/itemActions';
import { FittingRing } from './FittingRing';
import { FITTING_DRAG_TYPE, useFittingDrag, type FittingDragPayload } from './fittingDrag';
import { FittingItemActionsProvider, type FittingItemActions } from './fittingItemActions';
import { fakeItemActions } from './__fixtures__/itemActions';
import { resolveFittingView } from './fittingViewPreference';

/** A drop carrying this app's marker, with `payload` as the drag in progress. */
function dropWith(payload: FittingDragPayload) {
  useFittingDrag.setState({ payload });
  return { dataTransfer: { types: [FITTING_DRAG_TYPE], dropEffect: 'none' } };
}

const fitting: Fitting = {
  name: 'Test',
  shipTypeId: 1,
  modules: [
    { slot: 'high', slotIndex: 0, typeId: 10, state: 'active', chargeTypeId: 20 },
    { slot: 'low', slotIndex: 0, typeId: 11, state: 'online' },
  ],
  drones: [],
  cargo: [],
};

function statsWith(cpuUsed: number): FittingStats {
  return {
    cpuUsed,
    cpuTotal: 100,
    powergridUsed: 10,
    powergridTotal: 100,
    slotCounts: { high: 3, medium: 2, low: 1, rig: 0, subsystem: 5 },
    hardpoints: { turrets: 0, launchers: 0 },
    ...neutralExtendedStats(),
  } as FittingStats;
}

describe('FittingRing', () => {
  it('draws every slot the hull has, empty ones and subsystems included', () => {
    render(<FittingRing fitting={fitting} stats={statsWith(10)} />);
    expect(screen.getAllByLabelText(/^High slots \d/)).toHaveLength(3);
    expect(screen.getAllByLabelText(/^Mid slots \d/)).toHaveLength(2);
    expect(screen.getAllByLabelText(/^Subsystems \d/)).toHaveLength(5);
    expect(screen.getAllByLabelText(/empty$/)).toHaveLength(3 - 1 + 2 + 0 + 5);
  });

  it('seats a T3’s subsystems on the band, which drops the outlines of positions it lacks', () => {
    const { container, rerender } = render(<FittingRing fitting={fitting} stats={statsWith(10)} />);
    const subsystem = screen.getByLabelText(/^Subsystems 1, /);
    // On the band: turned with the ring like every other tile, not in a row beneath it.
    expect(subsystem.closest('[style*="rotate"]')).not.toBeNull();
    expect(screen.queryByText('Subsystems')).toBeNull();
    const outlines = () => container.querySelectorAll('span[aria-hidden="true"][style*="rotate"]');
    expect(outlines()).toHaveLength(0);

    const tactical = statsWith(10);
    tactical.slotCounts = { ...tactical.slotCounts, subsystem: 0 };
    rerender(<FittingRing fitting={fitting} stats={tactical} />);
    expect(outlines()).toHaveLength(8 - 3 + 8 - 2 + 8 - 1 + 3);
  });

  it('reports the slot tapped', () => {
    const onSlotSelect = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onSlotSelect={onSlotSelect} />);
    fireEvent.click(screen.getByLabelText('High slots 2, empty'));
    expect(onSlotSelect).toHaveBeenCalledWith('high', 1);
  });

  it('fits an Add panel item dropped on a slot of its rack, and refuses another rack’s', () => {
    const onDropType = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onDropType={onDropType} />);
    const empty = screen.getByLabelText('High slots 2, empty');

    fireEvent.drop(
      screen.getByLabelText('Mid slots 1, empty'),
      dropWith({ kind: 'type', typeId: 99, rack: 'high' })
    );
    expect(onDropType).not.toHaveBeenCalled();

    fireEvent.drop(empty, dropWith({ kind: 'type', typeId: 99, rack: 'high' }));
    expect(onDropType).toHaveBeenCalledWith('high', 1, 99);
    expect(useFittingDrag.getState().payload).toBeNull();
  });

  it('moves a fitted module dragged along its rack', () => {
    const onMoveModule = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onMoveModule={onMoveModule} />);
    fireEvent.drop(
      screen.getByLabelText('High slots 3, empty'),
      dropWith({ kind: 'slot', rack: 'high', index: 0 })
    );
    expect(onMoveModule).toHaveBeenCalledWith('high', 0, 2);
  });

  it('ignores a drop from outside the app', () => {
    const onDropType = vi.fn();
    render(<FittingRing fitting={fitting} stats={statsWith(10)} onDropType={onDropType} />);
    useFittingDrag.setState({ payload: { kind: 'type', typeId: 99, rack: 'high' } });
    fireEvent.drop(screen.getByLabelText('High slots 2, empty'), {
      dataTransfer: { types: ['text/plain'] },
    });
    expect(onDropType).not.toHaveBeenCalled();
    useFittingDrag.setState({ payload: null });
  });

  it('on the phone overview, edits through the rack buttons and not the tiles', () => {
    const onSlotSelect = vi.fn();
    const onRackOpen = vi.fn();
    render(
      <FittingRing
        fitting={fitting}
        stats={statsWith(10)}
        compact
        onSlotSelect={onSlotSelect}
        onRackOpen={onRackOpen}
      />
    );
    fireEvent.click(screen.getByLabelText('High slots 2, empty'));
    expect(onSlotSelect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /^High slots\s*1 \/ 3$/ }));
    expect(onRackOpen).toHaveBeenCalledWith('high');
    // A T3's subsystems get a sheet of their own.
    fireEvent.click(screen.getByRole('button', { name: /^Subsystems\s*0 \/ 5$/ }));
    expect(onRackOpen).toHaveBeenCalledWith('subsystem');
    // No readouts on the overview — the List bars carry those numbers.
    expect(screen.queryByRole('meter', { name: 'CPU' })).toBeNull();
  });

  it('flags over-used calibration, not just CPU and powergrid', () => {
    render(
      <FittingRing
        fitting={fitting}
        stats={{ ...statsWith(10), calibrationUsed: 450, calibrationTotal: 400 }}
      />
    );
    expect(screen.getByText('Over by 50.0')).toBeTruthy();
  });

  it('states the overage in words and flashes the readout once when over budget', () => {
    const { rerender, container } = render(<FittingRing fitting={fitting} stats={statsWith(90)} />);
    expect(screen.queryByText(/Over by/)).toBeNull();

    rerender(<FittingRing fitting={fitting} stats={statsWith(112.5)} />);
    expect(screen.getByText('Over by 12.5')).toBeTruthy();
    expect(container.querySelectorAll('.flash-danger')).toHaveLength(1);
    expect(container.querySelector('path.stroke-danger')).not.toBeNull();
  });

  it('draws CPU and powergrid as their own rim bands, each naming its numbers on hover', async () => {
    const { container } = render(<FittingRing fitting={fitting} stats={statsWith(25)} />);
    const cpu = container.querySelector('[data-gauge="cpu"]')!;
    const powergrid = container.querySelector('[data-gauge="powergrid"]')!;
    expect(cpu).not.toBeNull();
    expect(powergrid).not.toBeNull();
    // Told apart by form, not only by side: powergrid's band is dashed.
    expect(powergrid.querySelector('path[stroke-dasharray]')).not.toBeNull();
    expect(cpu.querySelector('path[stroke-dasharray]')).toBeNull();

    fireEvent.pointerMove(cpu, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('CPU: 25.0 / 100.0 tf (25%)');
  });

  it('keeps the gauges out of the accessibility tree — the readouts carry their numbers', () => {
    const { container } = render(<FittingRing fitting={fitting} stats={statsWith(25)} />);
    expect(container.querySelector('[data-gauge="cpu"]')!.closest('svg')).toHaveAttribute(
      'aria-hidden',
      'true'
    );
    expect(screen.getByRole('meter', { name: 'CPU' })).toBeTruthy();
  });

  it('draws plain gauges on the phone overview, with no thin tap target to reveal them', () => {
    const { container } = render(<FittingRing fitting={fitting} stats={statsWith(25)} compact />);
    const cpu = container.querySelector('[data-gauge="cpu"]')!;
    expect(cpu).not.toHaveAttribute('data-state');
    expect(cpu).not.toHaveClass('pointer-events-auto');
  });

  it('says how far over budget in the band’s tooltip', async () => {
    const { container } = render(<FittingRing fitting={fitting} stats={statsWith(112.5)} />);
    fireEvent.pointerMove(container.querySelector('[data-gauge="cpu"]')!, {
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('tooltip')).toHaveTextContent(
      'CPU: 112.5 / 100.0 tf (113%), over by 12.5'
    );
  });

  it('names the state a module actually reached, not the one a paste asked for', () => {
    render(
      <FittingRing
        fitting={fitting}
        stats={statsWith(10)}
        moduleResults={[
          { state: 'active', maxState: 'overload', chargeGroupIds: [] },
          { state: 'online', maxState: 'online', chargeGroupIds: [] },
        ]}
      />
    );
    expect(screen.getByLabelText('Low slots 1, online')).toBeTruthy();
  });

  it('marks each module that takes a charge with a rim pip, filled once one is loaded', () => {
    const { container } = render(
      <FittingRing
        fitting={{
          ...fitting,
          modules: [
            ...fitting.modules,
            { slot: 'high', slotIndex: 1, typeId: 12, state: 'active' },
          ],
        }}
        stats={statsWith(10)}
        moduleResults={[
          { state: 'active', maxState: 'overload', chargeGroupIds: [83] },
          { state: 'online', maxState: 'online', chargeGroupIds: [] },
          { state: 'active', maxState: 'overload', chargeGroupIds: [83] },
        ]}
      />
    );
    const pipOf = (slot: string) =>
      container
        .querySelector(`[data-ring-slot="${slot}"] [data-charge-pip]`)
        ?.getAttribute('data-charge-pip');
    expect(pipOf('high-0')).toBe('loaded');
    expect(pipOf('high-1')).toBe('empty');
    // A module that takes no charge, and an empty slot, get no pip at all.
    expect(pipOf('low-0')).toBeUndefined();
    expect(pipOf('high-2')).toBeUndefined();
  });

  it('colours each fitted tile border by the state it reached', () => {
    const { container } = render(
      <FittingRing
        fitting={fitting}
        stats={statsWith(10)}
        moduleResults={[
          { state: 'overload', maxState: 'overload', chargeGroupIds: [] },
          { state: 'online', maxState: 'online', chargeGroupIds: [] },
        ]}
      />
    );
    const tiles = [...container.querySelectorAll('[data-module-state]')];
    const borderOf = (state: string) =>
      tiles.find((el) => el.getAttribute('data-module-state') === state)?.className;
    expect(borderOf('overload')).toContain('border-warning');
    expect(borderOf('online')).toContain('border-accent');
  });

  it('marks the slot the Add panel is filling', () => {
    render(
      <FittingRing
        fitting={fitting}
        stats={statsWith(10)}
        selectedSlot={{ rack: 'high', index: 1 }}
      />
    );
    expect(screen.getByLabelText('High slots 2, empty')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('High slots 3, empty')).toHaveAttribute('aria-pressed', 'false');
    // A fitted tile opens its module rather than toggling, so it is no pressed button.
    expect(screen.getByLabelText('High slots 1, active')).not.toHaveAttribute('aria-pressed');
  });

  it('marks no slot as pressed on the phone overview, whose tiles only explain themselves', () => {
    render(
      <FittingRing
        fitting={fitting}
        stats={statsWith(10)}
        compact
        selectedSlot={{ rack: 'high', index: 1 }}
      />
    );
    expect(screen.getByLabelText('High slots 2, empty')).not.toHaveAttribute('aria-pressed');
  });

  it('lists the cargo beneath the ring, with its counts', () => {
    render(
      <FittingRing
        fitting={{ ...fitting, cargo: [{ typeId: 209, quantity: 1535 }] }}
        stats={statsWith(10)}
        typeName={(typeId) => (typeId === 209 ? 'Scourge Heavy Missile' : '')}
      />
    );
    // The badge's own "1.5K" is part of the name, so it can be spoken to select it.
    expect(screen.getByLabelText('Scourge Heavy Missile ×1,535 (1.5K)')).toHaveTextContent('1.5K');
  });

  it('marks the hull’s hardpoints on the rim, used ones filled, each kind with its numbers on hover', async () => {
    const { container } = render(
      <FittingRing
        fitting={fitting}
        stats={{ ...statsWith(10), hardpoints: { turrets: 3, launchers: 2 } }}
        hardpointsUsed={{ turrets: 2, launchers: 0 }}
      />
    );
    const turrets = container.querySelector('[data-hardpoints="turret"]')!;
    expect(turrets.querySelectorAll('circle')).toHaveLength(3);
    expect(turrets.querySelectorAll('circle.fill-accent')).toHaveLength(2);
    expect(container.querySelectorAll('[data-hardpoints="launcher"] circle')).toHaveLength(2);
    // The same numbers as text, for a screen reader or a keyboard — the rim is a picture.
    expect(screen.getByText('Turret hardpoints: 2 of 3 used')).toBeTruthy();
    expect(screen.getByText('Launcher hardpoints: 0 of 2 used')).toBeTruthy();

    fireEvent.pointerMove(turrets, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Turret hardpoints: 2 of 3 used');
  });

  it('heads each kind’s pips with the game’s hardpoint icon, so a split hull reads at a glance', () => {
    const { container } = render(
      <FittingRing
        fitting={fitting}
        stats={{ ...statsWith(10), hardpoints: { turrets: 3, launchers: 2 } }}
        hardpointsUsed={{ turrets: 1, launchers: 0 }}
      />
    );
    const glyph = (kind: string) =>
      container.querySelector(`[data-hardpoints="${kind}"] image`)?.getAttribute('href');
    expect(glyph('turret')).toBe('/images/fitting/hardpoint-turret.png');
    expect(glyph('launcher')).toBe('/images/fitting/hardpoint-launcher.png');
  });

  it('badges a high-slot tile with the hardpoint its module takes, and names it on hover', async () => {
    const kinds: Record<number, HardpointKind | null> = {
      10: 'turret',
      12: 'launcher',
      13: null,
    };
    const split: Fitting = {
      ...fitting,
      modules: [
        ...fitting.modules,
        { slot: 'high', slotIndex: 1, typeId: 12, state: 'active' },
        { slot: 'high', slotIndex: 2, typeId: 13, state: 'active' },
      ],
    };
    const { container } = render(
      <FittingRing
        fitting={split}
        stats={{ ...statsWith(10), hardpoints: { turrets: 1, launchers: 1 } }}
        hardpointsUsed={{ turrets: 1, launchers: 1 }}
        hardpointKindOf={(typeId) => kinds[typeId]}
        typeName={(typeId) => `Type ${typeId}`}
      />
    );
    const badge = (slot: string) =>
      container.querySelector(`[data-ring-slot="${slot}"] [data-hardpoint-badge]`);
    expect(badge('high-0')?.getAttribute('data-hardpoint-badge')).toBe('turret');
    expect(badge('high-1')?.getAttribute('data-hardpoint-badge')).toBe('launcher');
    // A utility high (a neut, a cloak) takes no hardpoint, and a low slot never does.
    expect(badge('high-2')).toBeNull();
    expect(badge('low-0')).toBeNull();
    // The badge is a picture; the tile's name carries it for a screen reader.
    expect(screen.getByLabelText('High slots 2, active, launcher hardpoint')).toBeTruthy();

    fireEvent.pointerMove(container.querySelector('[data-ring-slot="high-1"]')!, {
      pointerType: 'mouse',
    });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Uses a launcher hardpoint');
  });

  it('draws no hardpoints for a hull without them, and flags a rack fitted past them', () => {
    const { container } = render(
      <FittingRing
        fitting={fitting}
        stats={{ ...statsWith(10), hardpoints: { turrets: 1, launchers: 0 } }}
        hardpointsUsed={{ turrets: 2, launchers: 0 }}
      />
    );
    expect(container.querySelector('[data-hardpoints="launcher"]')).toBeNull();
    expect(
      container.querySelectorAll('[data-hardpoints="turret"] circle.fill-danger')
    ).toHaveLength(1);
    // Not by colour alone.
    expect(
      screen.getByText('Turret hardpoints: 2 of 1 used — 1 more than the hull has')
    ).toBeTruthy();
  });
});

describe('FittingRing with the editor’s item actions', () => {
  const results = [
    { state: 'active' as const, maxState: 'overload' as const, chargeGroupIds: [] },
    { state: 'online' as const, maxState: 'online' as const, chargeGroupIds: [] },
  ];
  const names = { 10: 'Autocannon', 11: 'Damage Control', 20: 'EMP S', 21: 'Fusion S' };

  function renderRing(
    actions: FittingItemActions,
    props: Partial<ComponentProps<typeof FittingRing>> = {}
  ) {
    return render(
      <MemoryRouter>
        <FakeItemActions>
          <FittingItemActionsProvider value={actions}>
            <FittingRing
              fitting={fitting}
              stats={statsWith(10)}
              typeName={(typeId) => names[typeId as keyof typeof names] ?? '?'}
              moduleResults={results}
              {...props}
            />
          </FittingItemActionsProvider>
        </FakeItemActions>
      </MemoryRouter>
    );
  }

  it('opens a fitted tile’s menu: its reachable states, unload, remove', async () => {
    const actions = fakeItemActions({ names });
    renderRing(actions);
    fireEvent.contextMenu(screen.getByLabelText('High slots 1, active'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'State' }));
    const states = await screen.findAllByRole('menuitemradio');
    expect(states.map((item) => item.textContent?.replace('✓', ''))).toEqual([
      'Offline',
      'Online',
      'Active',
      'Overloaded',
    ]);
    expect(screen.getByRole('menuitemradio', { name: 'Active' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Overloaded' }));
    expect(actions.setState).toHaveBeenCalledWith('high', 0, 'overload');

    fireEvent.contextMenu(screen.getByLabelText('High slots 1, active'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Unload EMP S' }));
    expect(actions.unloadCharge).toHaveBeenCalledWith('high', 0);

    fireEvent.contextMenu(screen.getByLabelText('High slots 1, active'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove Autocannon' }));
    expect(actions.remove).toHaveBeenCalledWith('high', 0);
  });

  it('loads a module’s charge into every compatible module from its menu', async () => {
    const actions = fakeItemActions({ names });
    renderRing(actions);
    fireEvent.contextMenu(screen.getByLabelText('High slots 1, active'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Load EMP S into all compatible' })
    );
    expect(actions.charges.load).toHaveBeenCalledWith(20, { fromCargo: false });
  });

  it('offers a passive module only the states it can reach', async () => {
    renderRing(fakeItemActions({ names }));
    fireEvent.contextMenu(screen.getByLabelText('Low slots 1, online'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'State' }));
    const states = await screen.findAllByRole('menuitemradio');
    expect(states.map((item) => item.textContent?.replace('✓', ''))).toEqual(['Offline', 'Online']);
  });

  it('gives a subsystem’s menu no states — a subsystem can’t be put offline', async () => {
    const t3: Fitting = {
      ...fitting,
      modules: [
        ...fitting.modules,
        { slot: 'subsystem', slotIndex: 0, typeId: 30, state: 'online' },
      ],
    };
    renderRing(fakeItemActions({ names }), { fitting: t3, moduleResults: null });
    fireEvent.contextMenu(screen.getByLabelText(/^Subsystems 1, /));
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'State' })).toBeNull();
    expect(within(menu).getByRole('menuitem', { name: 'Remove #30' })).toBeTruthy();
  });

  it('draws a subsystem online, not greyed out, though the engine reports it offline', () => {
    const t3: Fitting = {
      ...fitting,
      modules: [
        ...fitting.modules,
        { slot: 'subsystem', slotIndex: 0, typeId: 30, state: 'online' },
      ],
    };
    renderRing(fakeItemActions({ names }), {
      fitting: t3,
      moduleResults: [
        ...results,
        { state: 'offline' as const, maxState: 'offline' as const, chargeGroupIds: [] },
      ],
    });
    const tile = screen.getByLabelText('Subsystems 1, online');
    expect(tile.getAttribute('data-module-state')).toBe('online');
  });

  it('removes a focused module with Delete', () => {
    const actions = fakeItemActions({ names });
    renderRing(actions);
    fireEvent.keyDown(screen.getByLabelText('High slots 1, active'), { key: 'Delete' });
    expect(actions.remove).toHaveBeenCalledWith('high', 0);
  });

  it('gives an empty slot recent modules, paste and fill-rack', async () => {
    const actions = fakeItemActions({ names }, { recentFor: () => [10], clipboardFor: () => 10 });
    renderRing(actions);
    fireEvent.contextMenu(screen.getByLabelText('High slots 2, empty'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Paste Autocannon' }));
    expect(actions.addModule).toHaveBeenCalledWith('high', 1, 10);

    fireEvent.contextMenu(screen.getByLabelText('High slots 2, empty'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Fill rack with Autocannon' }));
    expect(actions.fillRack).toHaveBeenCalledWith('high', 10);
  });

  it('is one tab stop, the arrow keys walking the slots in ring order', () => {
    renderRing(fakeItemActions({ names }));
    const first = screen.getByLabelText('High slots 1, active');
    const second = screen.getByLabelText('High slots 2, empty');
    expect(first).toHaveAttribute('tabindex', '0');
    expect(second).toHaveAttribute('tabindex', '-1');
    first.focus();
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(second).toHaveFocus();
    expect(second).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(second, { key: 'ArrowLeft' });
    expect(first).toHaveFocus();
  });

  it('lights the modules a charge drag would load, and loads through the page on a drop — Alt for one', () => {
    const actions = fakeItemActions({ names, takes: { 21: ['high-0'] } });
    renderRing(actions);
    const payload: FittingDragPayload = {
      kind: 'charge',
      typeId: 21,
      fromCargo: true,
      targets: ['high-0'],
    };
    act(() => useFittingDrag.setState({ payload }));
    expect(screen.getByLabelText('Low slots 1, online').className).toContain('opacity-35');
    expect(screen.getByLabelText('High slots 1, active').className).not.toContain('opacity-35');

    // A dim tile doesn't take it, so it falls through to the ring, which places it.
    fireEvent.drop(screen.getByLabelText('Low slots 1, online'), dropWith(payload));
    expect(actions.drop).toHaveBeenCalledWith(payload, { kind: 'ring' }, undefined);
    vi.mocked(actions.drop).mockClear();

    // jsdom has no DragEvent, so the drop can't carry altKey on its own.
    const target = screen.getByLabelText('High slots 1, active');
    const altDrop = createEvent.drop(target, dropWith(payload));
    Object.defineProperty(altDrop, 'altKey', { value: true });
    fireEvent(target, altDrop);
    expect(actions.drop).toHaveBeenCalledWith(
      payload,
      { kind: 'slot', rack: 'high', index: 0, filled: true },
      true
    );
  });

  it('places a module dropped anywhere on the ring, but only while its rack has a free slot', () => {
    const actions = fakeItemActions({ names });
    renderRing(actions, { onDropType: vi.fn() });
    const medium: FittingDragPayload = { kind: 'type', typeId: 99, rack: 'medium' };
    // Over a low tile, which doesn't take a mid-slot module.
    fireEvent.drop(screen.getByLabelText('Low slots 1, online'), dropWith(medium));
    expect(actions.drop).toHaveBeenCalledWith(medium, { kind: 'ring' }, undefined);
    vi.mocked(actions.drop).mockClear();

    // The one low slot is taken: nowhere to go.
    const low: FittingDragPayload = { kind: 'type', typeId: 98, rack: 'low' };
    fireEvent.drop(screen.getByLabelText('High slots 2, empty'), dropWith(low));
    expect(actions.drop).not.toHaveBeenCalled();
  });

  it('lets a slot that takes the drop have it, rather than the ring around it too', () => {
    const actions = fakeItemActions({ names });
    const onDropType = vi.fn();
    renderRing(actions, { onDropType });
    const high: FittingDragPayload = { kind: 'type', typeId: 99, rack: 'high' };
    fireEvent.drop(screen.getByLabelText('High slots 1, active'), dropWith(high));
    expect(onDropType).toHaveBeenCalledWith('high', 0, 99);
    expect(actions.drop).not.toHaveBeenCalled();
  });

  it('puts an Add panel item dropped on the cargo row in the hold', () => {
    const actions = fakeItemActions({ names });
    renderRing(actions);
    const payload: FittingDragPayload = { kind: 'type', typeId: 99, rack: 'low' };
    fireEvent.drop(screen.getByText('Cargo'), dropWith(payload));
    expect(actions.drop).toHaveBeenCalledWith(payload, { kind: 'cargo' }, undefined);
  });

  it('drags a module out of the cargo as a module, which a slot hands to the page', () => {
    const actions = fakeItemActions({ names, racks: { 12: 'high' } });
    const onDropType = vi.fn();
    renderRing(actions, {
      onDropType,
      fitting: { ...fitting, cargo: [{ typeId: 12, quantity: 1 }] },
    });
    const tile = screen.getByLabelText(/^#12 ×1|×1/);
    const setData = vi.fn();
    fireEvent.dragStart(tile, { dataTransfer: { setData, effectAllowed: 'all' } });
    const payload = useFittingDrag.getState().payload;
    expect(payload).toEqual({ kind: 'type', typeId: 12, rack: 'high', fromCargo: true });

    // Onto a high slot: through the page's drop, which takes it off the stack.
    fireEvent.drop(screen.getByLabelText('High slots 2, empty'), dropWith(payload!));
    expect(onDropType).not.toHaveBeenCalled();
    expect(actions.drop).toHaveBeenCalledWith(
      payload,
      { kind: 'slot', rack: 'high', index: 1, filled: false },
      undefined
    );
  });

  it('opens a cargo tile’s actions on a click, and loads it into every module that takes it', async () => {
    const actions = fakeItemActions({ names, takes: { 21: ['high-0'] } });
    renderRing(actions, { fitting: { ...fitting, cargo: [{ typeId: 21, quantity: 200 }] } });
    fireEvent.click(screen.getByLabelText('Fusion S ×200'));
    fireEvent.click(
      await screen.findByRole('menuitem', { name: 'Load into all compatible (1 module)' })
    );
    expect(actions.charges.load).toHaveBeenCalledWith(21, { fromCargo: true });
  });

  it('offers Add cargo, even with the hold empty', () => {
    const actions = fakeItemActions({ names });
    renderRing(actions);
    fireEvent.click(screen.getByRole('button', { name: 'Add cargo' }));
    expect(actions.openAddCargo).toHaveBeenCalled();
  });
});

describe('resolveFittingView', () => {
  it('defaults by breakpoint when nothing is stored, and honours a stored choice', () => {
    expect(resolveFittingView(null, false)).toBe('ring');
    expect(resolveFittingView(null, true)).toBe('list');
    expect(resolveFittingView('ring', true)).toBe('ring');
    expect(resolveFittingView('list', false)).toBe('list');
  });
});
