import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { Checkbox } from '@/components/ui';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { fakeItemActions, withItemActions } from '@/features/market/__fixtures__/itemActions';
import type { BlueprintCatalogEntry } from './blueprintCatalog';
import type { OpportunityRow } from './opportunities';
import type { OwnedBlueprintRow } from './ownedBlueprints';
import type { MarketWideResultRow } from './marketWideOpportunities';
import { isCardOwnClick, startPlanOnce, useRowStartPlan } from './rowStartPlan';
import { StartPlanButton } from './StartPlanButton';
import { MobileOpportunityList } from './MobileOpportunityList';
import { MobileOwnedBlueprintList } from './MobileOwnedBlueprintList';
import { MobileMarketWideList } from './MobileMarketWideList';

function deferred() {
  let resolve!: (navigated: boolean) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<boolean>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('isCardOwnClick', () => {
  function renderCard() {
    const seen: boolean[] = [];
    render(
      <ul>
        <li data-testid="card" onClick={(event) => seen.push(isCardOwnClick(event))}>
          <span>Name</span>
          <Checkbox checked={false} onChange={() => {}} aria-label="pick" />
          <button type="button">Plan</button>
          <a href="/x">Link</a>
          <span role="menuitem">Menu</span>
        </li>
      </ul>
    );
    return seen;
  }

  it('is true for the card and plain text inside it', () => {
    const seen = renderCard();
    fireEvent.click(screen.getByText('Name'));
    fireEvent.click(screen.getByTestId('card'));
    expect(seen).toEqual([true, true]);
  });

  it('is false for a checkbox, button, link or menu item inside it', () => {
    const seen = renderCard();
    fireEvent.click(screen.getByLabelText('pick'));
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    fireEvent.click(screen.getByRole('link', { name: 'Link' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Menu' }));
    expect(seen).toEqual([false, false, false, false]);
  });
});

describe('useRowStartPlan', () => {
  it('drops a second click while the first is saving, and keeps the guard once it navigated', async () => {
    const d = deferred();
    const start = vi.fn(() => d.promise);
    const target = {};
    const { result } = renderHook(() => useRowStartPlan(start));
    act(() => result.current(target));
    act(() => result.current(target));
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(true));
    act(() => result.current(target));
    expect(start).toHaveBeenCalledTimes(1);
  });

  it('re-arms when nothing opened, or the start rejects', async () => {
    const start = vi
      .fn<(t: object) => Promise<boolean>>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(true);
    const target = {};
    const { result } = renderHook(() => useRowStartPlan(start));
    await act(async () => result.current(target));
    await act(async () => result.current(target));
    await act(async () => result.current(target));
    expect(start).toHaveBeenCalledTimes(3);
  });

  it('shares its guard with Start plan: button then row makes one plan', async () => {
    const d = deferred();
    const start = vi.fn(() => d.promise);
    const entry = {} as BlueprintCatalogEntry;
    render(<StartPlanButton onStart={() => start()} planKey={entry} />);
    const { result } = renderHook(() =>
      useRowStartPlan(
        () => start(),
        () => entry
      )
    );
    fireEvent.click(screen.getByRole('button', { name: 'Plan' }));
    act(() => result.current(entry));
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(false));
  });

  it('row then button makes one plan too', async () => {
    const d = deferred();
    const start = vi.fn(() => d.promise);
    const entry = {} as BlueprintCatalogEntry;
    const { result } = renderHook(() =>
      useRowStartPlan(
        () => start(),
        () => entry
      )
    );
    act(() => result.current(entry));
    // startPlanOnce is what the button routes through.
    await expect(startPlanOnce(entry, () => start())).resolves.toBe(false);
    expect(start).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(false));
  });
});

const wrap = (node: React.ReactNode) => (
  <MemoryRouter>{withItemActions(node, fakeItemActions())}</MemoryRouter>
);

describe('phone cards: tap runs Start plan, controls are exempt', () => {
  it('Opportunities card', () => {
    const entry = {
      blueprintTypeID: 900,
      blueprint: { activity: 'manufacturing', skills: [] },
      productTypeID: 1000,
      productName: 'Widget Alpha',
      productNameLower: 'widget alpha',
    } as unknown as BlueprintCatalogEntry;
    const row = {
      candidate: {
        id: '1:1',
        characterId: 1,
        characterName: 'Pilot',
        blueprint: { item_id: 1, type_id: 900, runs: -1 },
        catalogEntry: entry,
      },
      result: {
        seconds: 60,
        iskPerHour: null,
        marginPct: null,
        profit: null,
        materials: [],
        totalCost: 0,
        revenue: null,
      },
      orderDepth: 'deep',
    } as unknown as OpportunityRow;
    const onStartPlan = vi.fn(() => Promise.resolve(false));
    const onToggleSelected = vi.fn();
    render(
      wrap(
        <MobileOpportunityList
          rows={[row]}
          showCharacterColumn={false}
          selectedIds={new Set()}
          onToggleSelected={onToggleSelected}
          onClearSelected={() => {}}
          onCompare={() => {}}
          onStartPlan={onStartPlan}
          onViewHistory={() => {}}
          skillGateFor={() => undefined}
          nameForSkill={String}
          nameForCharacter={String}
        />
      )
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSelected).toHaveBeenCalledTimes(1);
    expect(onStartPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /More actions/ }));
    expect(onStartPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Widget Alpha'));
    expect(onStartPlan).toHaveBeenCalledWith(entry);
  });

  const owned = (catalogEntry: BlueprintCatalogEntry | null, id: string): OwnedBlueprintRow =>
    ({
      id,
      owner: { kind: 'character', characterId: 1, name: 'Pilot' },
      blueprint: {
        item_id: Number(id),
        type_id: Number(id) * 100,
        runs: -1,
        material_efficiency: 10,
        time_efficiency: 20,
        quantity: -1,
        location_id: 1,
        location_flag: 'Hangar',
      },
      name: id === '1' ? 'Rifter Blueprint' : 'Merlin Blueprint',
      kind: 'bpo',
      activity: 'manufacturing',
      catalogEntry,
      iskPerHour: null,
    }) as unknown as OwnedBlueprintRow;

  it('Owned blueprint card: tap plans a catalogued blueprint, an uncatalogued one is inert', () => {
    const entry = { productName: 'Rifter' } as unknown as BlueprintCatalogEntry;
    const onStartPlan = vi.fn(() => Promise.resolve(false));
    render(
      wrap(
        <MobileOwnedBlueprintList
          rows={[owned(entry, '1'), owned(null, '2')]}
          locationLabel={() => 'Jita'}
          showOwner={false}
          onStartPlan={onStartPlan}
        />
      )
    );
    fireEvent.click(screen.getByText('Merlin'));
    expect(onStartPlan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Start a plan for/ }));
    expect(onStartPlan).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText('Rifter'));
    // The button's guard already claimed this entry while its plan was saving.
    expect(onStartPlan).toHaveBeenCalledTimes(1);
  });

  it('Market-wide card: tap plans, its Plan button does not double-fire', async () => {
    const mw = {
      productTypeID: 200,
      productName: 'Widget Beta',
      blueprintTypeID: 1200,
      blueprintSource: 'contract',
      priceCapped: false,
      iskPerHour: 1,
      buildCost: 1,
      orderDepth: 'deep',
      marginPct: 1,
      seconds: 60,
    } as unknown as MarketWideResultRow;
    const onStartPlan = vi.fn(() => Promise.resolve(false));
    render(
      wrap(
        <MobileMarketWideList
          rows={[mw]}
          total={1}
          sort={{ columnId: 'iskPerHour', direction: 'desc' }}
          onSortChange={() => {}}
          skillGateFor={() => undefined}
          nameForSkill={String}
          nameForCharacter={String}
          onStartPlan={onStartPlan}
        />
      )
    );
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start a plan for Widget Beta' }));
    });
    expect(onStartPlan).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(screen.getByText('Widget Beta'));
    });
    expect(onStartPlan).toHaveBeenCalledTimes(2);
  });
});
