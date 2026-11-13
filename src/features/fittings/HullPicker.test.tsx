import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HullPicker } from './HullPicker';

const { usePopularFitsMock, useHullFlyMarksMock, useRecentHullIdsMock } = vi.hoisted(() => ({
  usePopularFitsMock: vi.fn(),
  useHullFlyMarksMock: vi.fn<() => HullFlyMarks | null>(() => null),
  useRecentHullIdsMock: vi.fn<() => number[]>(() => []),
}));
// The EVE Workbench rows read the losses too, for their "Seen on zKillboard" badge.
vi.mock('./popularFits', () => ({
  usePopularFits: usePopularFitsMock,
  loadPopularFits: () => Promise.resolve({ ok: true, fits: [] }),
}));
vi.mock('./useHullFlyMarks', () => ({ useHullFlyMarks: useHullFlyMarksMock }));
vi.mock('./useRecentHulls', () => ({ useRecentHullIds: useRecentHullIdsMock }));
import type { HullFlyMarks } from './useHullFlyMarks';
import type { FittingCatalogue } from './useFittingCatalogue';

const groups = [
  { id: 4, name: 'Ships', parentId: null, hasTypes: false },
  { id: 8, name: 'Cruisers', parentId: 4, hasTypes: false },
  { id: 801, name: 'Gallente', parentId: 8, hasTypes: true },
  { id: 5, name: 'Frigates', parentId: 4, hasTypes: false },
  { id: 511, name: 'Minmatar', parentId: 5, hasTypes: true },
];

const catalogue = {
  groupsById: new Map(groups.map((group) => [group.id, group])),
  marketTypes: [
    { typeId: 626, name: 'Vexor', marketGroupId: 801 },
    { typeId: 587, name: 'Rifter', marketGroupId: 511 },
  ],
} as unknown as FittingCatalogue;

describe('HullPicker', () => {
  const search = (value: string) =>
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search hulls' }), {
      target: { value },
    });

  it('lists no hulls until there is a search', () => {
    render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
    expect(screen.getByText('Search for a hull to begin.')).toBeTruthy();
    search('  ');
    expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
  });

  it('asks for a hull to be picked, with nothing to start, until one is', () => {
    render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
    expect(screen.getByText('Pick a hull to start')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start empty fit' })).toBeNull();
    search('rift');
    fireEvent.click(screen.getByRole('button', { name: 'Rifter' }));
    expect(screen.queryByText('Pick a hull to start')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Rifter' })).toBeTruthy();
  });

  it('groups matches by class and starts the one picked', () => {
    const onStart = vi.fn();
    render(<HullPicker catalogue={catalogue} onStart={onStart} />);
    search('r');
    const list = screen.getByTestId('hull-list');
    expect(within(list).getByRole('heading', { name: /Frigates/ })).toBeTruthy();
    expect(within(list).getByRole('heading', { name: /Cruisers/ })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Vexor' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start empty fit' }));
    expect(onStart).toHaveBeenCalledWith({ typeId: 626, name: 'Vexor', group: 'Gallente' });
  });

  it('goes back to the hulls from the picked one', () => {
    render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
    search('rift');
    fireEvent.click(screen.getByRole('button', { name: 'Rifter' }));
    fireEvent.click(screen.getByRole('button', { name: 'Hulls' }));
    expect(screen.getByText('Pick a hull to start')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start empty fit' })).toBeNull();
  });

  it("lists the Character's recent hulls before anything is typed", () => {
    useRecentHullIdsMock.mockReturnValue([587]);
    try {
      render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
      expect(screen.getByRole('heading', { name: 'Recent hulls' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Rifter' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
      expect(screen.queryByText('Search for a hull to begin.')).toBeNull();
    } finally {
      useRecentHullIdsMock.mockReturnValue([]);
    }
  });

  it('narrows the classes to the hulls the search matches', () => {
    render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
    search('rift');
    expect(screen.getByRole('button', { name: 'Rifter' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Cruisers/ })).toBeNull();
  });

  it('starts a hull at once on double-click', () => {
    const onStart = vi.fn();
    render(<HullPicker catalogue={catalogue} onStart={onStart} />);
    search('rift');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Rifter' }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ typeId: 587 }));
  });

  it("shows the picked hull's Popular fits, and opens one", async () => {
    const HULL_ID = 587;
    usePopularFitsMock.mockReturnValue({
      ok: true,
      fits: [
        {
          key: '100,200,300',
          count: 4,
          lastSeen: null,
          value: null,
          killmailIds: [9],
          parts: {
            hullTypeId: HULL_ID,
            modules: [
              { slot: 'high' as const, slotIndex: 0, typeId: 100, state: 'active' as const },
            ],
            drones: [],
            cargo: [],
            unresolved: [],
          },
        },
      ],
    });
    const onOpenPopular = vi.fn();
    render(<HullPicker catalogue={catalogue} onStart={() => {}} onOpenPopular={onOpenPopular} />);
    expect(screen.queryByRole('region', { name: 'Popular fits' })).toBeNull();
    search('rift');
    fireEvent.click(screen.getByRole('button', { name: 'Rifter' }));
    expect(await screen.findByText('4 losses')).toBeTruthy();
    expect(usePopularFitsMock.mock.lastCall?.[0]).toBe(587);
    fireEvent.click(screen.getByRole('button', { name: '4 losses' }));
    expect(onOpenPopular).toHaveBeenCalledWith(
      expect.objectContaining({
        fitting: expect.objectContaining({ name: 'Rifter popular fit 1', shipTypeId: 587 }),
      })
    );
  });

  describe('can-fly marks', () => {
    beforeEach(() => useActiveCharacter.setState({ activeCharacterId: 7 }));
    afterEach(() => {
      // Unmount first: clearing the Character re-renders a mounted picker outside act.
      cleanup();
      useHullFlyMarksMock.mockReset().mockReturnValue(null);
      useActiveCharacter.setState({ activeCharacterId: null });
    });

    it("marks each hull as the Ship Tree does: can fly, can't fly yet, needs Omega", () => {
      useHullFlyMarksMock.mockReturnValue((typeId) =>
        typeId === 587
          ? { status: { canFly: true, secondsToFly: 0, mastery: 1 }, needsOmega: false }
          : { status: { canFly: false, secondsToFly: 3_600, mastery: 0 }, needsOmega: true }
      );
      render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
      search('r');
      const rifter = screen.getByRole('button', { name: 'Rifter', description: 'Can fly' });
      expect(rifter.querySelector('[data-shape="dot"]')).toBeTruthy();
      expect(rifter.textContent).not.toContain('Ω');
      const vexor = screen.getByRole('button', {
        name: 'Vexor',
        description: '1h 0m to fly, Needs an Omega clone',
      });
      expect(vexor.querySelector('[data-shape="ring"]')).toBeTruthy();
      expect(vexor.textContent).toContain('Ω');
    });

    it('narrows the hulls to the ones the Character can fly', () => {
      useHullFlyMarksMock.mockReturnValue((typeId) =>
        typeId === 587
          ? { status: { canFly: true, secondsToFly: 0, mastery: 1 }, needsOmega: false }
          : { status: { canFly: false, secondsToFly: 3_600, mastery: 0 }, needsOmega: false }
      );
      render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
      search('r');
      expect(screen.getByRole('button', { name: 'Vexor' })).toBeTruthy();
      fireEvent.click(screen.getByRole('checkbox', { name: 'Only hulls I can fly' }));
      expect(screen.getByRole('button', { name: 'Rifter' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Vexor' })).toBeNull();
      expect(screen.queryByRole('heading', { name: /Cruisers/ })).toBeNull();
      search('vex');
      expect(screen.getByText('No hull you can fly matches that search.')).toBeTruthy();
    });

    it('offers no can-fly filter until the marks are known', () => {
      render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
      expect(screen.queryByRole('checkbox', { name: 'Only hulls I can fly' })).toBeNull();
    });

    it('lists hulls unmarked until the marks are known', () => {
      render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
      search('r');
      const vexor = screen.getByRole('button', { name: 'Vexor' });
      expect(vexor.querySelector('[data-shape]')).toBeNull();
    });

    it('never reads the Ship Tree with no Character', () => {
      useActiveCharacter.setState({ activeCharacterId: null });
      render(<HullPicker catalogue={catalogue} onStart={() => {}} />);
      search('r');
      expect(useHullFlyMarksMock).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Vexor' })).toBeTruthy();
    });
  });
});
