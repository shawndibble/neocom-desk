import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import '@/i18n';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { HullPicker } from './HullPicker';

const { usePopularFitsMock, useHullFlyMarksMock } = vi.hoisted(() => ({
  usePopularFitsMock: vi.fn(),
  useHullFlyMarksMock: vi.fn<() => HullFlyMarks | null>(() => null),
}));
vi.mock('./popularFits', () => ({ usePopularFits: usePopularFitsMock }));
vi.mock('./useHullFlyMarks', () => ({ useHullFlyMarks: useHullFlyMarksMock }));
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

  it('groups matches by class and starts the one picked', () => {
    const onStart = vi.fn();
    render(<HullPicker catalogue={catalogue} onStart={onStart} />);
    search('r');
    expect(screen.getByRole('heading', { name: /Frigates/ })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Cruisers/ })).toBeTruthy();

    const start = screen.getByRole('button', { name: 'Start fitting' });
    expect((start as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Vexor' }));
    fireEvent.click(start);
    expect(onStart).toHaveBeenCalledWith({ typeId: 626, name: 'Vexor', group: 'Gallente' });
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
      const rifter = screen.getByRole('button', { name: 'Rifter — Can fly' });
      expect(rifter.querySelector('[data-shape="dot"]')).toBeTruthy();
      expect(rifter.textContent).not.toContain('Ω');
      const vexor = screen.getByRole('button', {
        name: 'Vexor — 1h 0m to fly, Needs an Omega clone',
      });
      expect(vexor.querySelector('[data-shape="ring"]')).toBeTruthy();
      expect(vexor.textContent).toContain('Ω');
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
