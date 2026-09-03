import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { ItemContextMenu } from '@/features/market/ItemContextMenu';
import { materialCostLines } from '@/engine/industry/sourcing';
import type {
  EffectiveMaterial,
  HubPrices,
  MaterialCostLine,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import type { OwnedStockPlacement } from '@/engine/industry/ownedStock';
import { applySourcingPatch } from './sourcingEdits';
import { MaterialsTable } from './MaterialsTable';
import type { OwnedStockDetection } from './ownedStockDetection';

const NAMES: Record<number, string> = {
  34: 'Tritanium',
  35: 'Pyerite',
  9840: 'Mechanical Parts',
};
const nameFor = (typeID: number) => NAMES[typeID] ?? `#${typeID}`;

const MATERIALS: readonly EffectiveMaterial[] = [
  { typeID: 34, baseQuantity: 1000, quantity: 1000 },
  { typeID: 35, baseQuantity: 200, quantity: 200 },
];
const HUB_PRICES: HubPrices = { 34: 5, 35: 10 };

interface HarnessProps {
  initial?: MaterialSourcingMap;
  hubPrices?: HubPrices;
  pricesReady?: boolean;
  onChange?: (typeID: number, patch: MaterialSourcing) => void;
  detection?: OwnedStockDetection;
}

/**
 * Stands in for BuildPlanDetail: holds the sourcing map an edit patches and
 * re-prices through the same engine call the real panel uses, so a test can
 * assert what an edit does to the row rather than only that a callback fired.
 */
function Harness({
  initial,
  hubPrices = HUB_PRICES,
  pricesReady = true,
  onChange,
  detection,
}: HarnessProps) {
  const [sourcing, setSourcing] = useState<MaterialSourcingMap | undefined>(initial);
  return (
    <MaterialsTable
      materials={materialCostLines(MATERIALS, hubPrices, sourcing)}
      nameFor={nameFor}
      sourcing={sourcing}
      pricesReady={pricesReady}
      detection={detection}
      onSourcingChange={(typeID, patch) => {
        onChange?.(typeID, patch);
        setSourcing((current) => applySourcingPatch(current, typeID, patch));
      }}
    />
  );
}

function row(name: string): HTMLElement {
  const cell = screen.getByText(name).closest('tr');
  if (!cell) throw new Error(`no row for ${name}`);
  return cell;
}

const ownedInput = (material: string) =>
  screen.getByRole('spinbutton', { name: `Owned quantity for ${material}` });
const overrideInput = (material: string) =>
  screen.getByRole('spinbutton', { name: `Override unit price for ${material}` });

async function setField(input: HTMLElement, value: string) {
  const user = userEvent.setup();
  await user.clear(input);
  if (value !== '') await user.type(input, value);
  await user.tab();
}

describe('MaterialsTable sourcing', () => {
  it('prices every row at the hub with no overrides set', () => {
    render(<Harness />);
    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('5')).toBeTruthy();
    expect(tritanium.getByText('5,000')).toBeTruthy();
    expect(tritanium.getByText('Hub')).toBeTruthy();
  });

  it('falls back to placeholder text for every row when prices could not be loaded', () => {
    render(<Harness pricesReady={false} />);
    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('No price')).toBeTruthy();
    expect(tritanium.getByText('—')).toBeTruthy();
  });

  it('keeps showing an override price when prices could not be loaded', () => {
    // The override is the player's own number, so no market data is needed to
    // price the row — and the results panel already counts it.
    render(<Harness initial={{ 34: { overridePrice: 7 } }} pricesReady={false} />);
    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('Override')).toBeTruthy();
    expect(tritanium.getByText('7,000')).toBeTruthy();
    expect(tritanium.queryByText('No price')).toBeNull();
  });

  it('editing an owned quantity reprices the row and reports the patch', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await setField(ownedInput('Tritanium'), '400');

    expect(onChange).toHaveBeenCalledWith(34, { ownedQuantity: 400 });
    const tritanium = within(row('Tritanium'));
    // 600 still to buy at 5 ISK, the 400 owned are free.
    expect(tritanium.getByText('3,000')).toBeTruthy();
    expect(tritanium.getByText('400 owned + 600 x 5')).toBeTruthy();
    // Untouched rows keep their hub pricing.
    expect(within(row('Pyerite')).getByText('2,000')).toBeTruthy();
  });

  it('accepts an owned quantity above the required amount and shows no error, the engine clamps it', async () => {
    render(<Harness />);

    await setField(ownedInput('Tritanium'), '5000');

    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('all 1,000 owned')).toBeTruthy();
    expect(tritanium.getByText('0')).toBeTruthy();
    // The number the player typed is kept verbatim — it is not an error to fix.
    expect((ownedInput('Tritanium') as HTMLInputElement).value).toBe('5000');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(tritanium.queryByText('No price')).toBeNull();
  });

  it('an override price replaces the hub price for the row', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await setField(overrideInput('Tritanium'), '7');

    expect(onChange).toHaveBeenCalledWith(34, { overridePrice: 7 });
    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('7')).toBeTruthy();
    expect(tritanium.getByText('7,000')).toBeTruthy();
  });

  it('clearing an override price reverts the row to the hub price', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ 34: { overridePrice: 7 } }} onChange={onChange} />);
    expect(within(row('Tritanium')).getByText('7,000')).toBeTruthy();

    await setField(overrideInput('Tritanium'), '');

    expect(onChange).toHaveBeenCalledWith(34, { overridePrice: undefined });
    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('5,000')).toBeTruthy();
    expect(tritanium.getByText('Hub')).toBeTruthy();
  });

  it('distinguishes hub-priced, owned and overridden rows by text, not colour alone', () => {
    render(
      <Harness
        initial={{ 34: { overridePrice: 5 }, 35: { ownedQuantity: 200 } }}
        hubPrices={{ 34: 5, 35: 10 }}
      />
    );

    // Overridden — flagged even though the override equals the hub price, so
    // the cue cannot come from comparing numbers.
    expect(within(row('Tritanium')).getByText('Override')).toBeTruthy();
    // Fully owned.
    expect(within(row('Pyerite')).getByText('all 200 owned')).toBeTruthy();
  });

  it('labels a partly-owned unpriced remainder without inventing a total', () => {
    render(<Harness initial={{ 35: { ownedQuantity: 50 } }} hubPrices={{ 34: 5 }} />);

    const pyerite = within(row('Pyerite'));
    expect(pyerite.getByText('No price')).toBeTruthy();
    expect(pyerite.getByText('50 owned + 150 to buy')).toBeTruthy();
  });

  it('is reachable and committable with the keyboard alone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.tab();
    expect(document.activeElement).toBe(ownedInput('Tritanium'));
    await user.keyboard('250');
    // Tab out: blur is what commits.
    await user.tab();
    expect(document.activeElement).toBe(overrideInput('Tritanium'));
    expect(onChange).toHaveBeenCalledWith(34, { ownedQuantity: 250 });
    expect(within(row('Tritanium')).getByText('250 owned + 750 x 5')).toBeTruthy();
  });

  it('keeps a visible focus ring on both editable inputs', () => {
    render(<Harness />);
    for (const input of [ownedInput('Tritanium'), overrideInput('Tritanium')]) {
      expect(input.className).toContain('focus-visible:outline-2');
      expect(input.className).toContain('border');
    }
  });

  it('does not rewrite the record when a field is tabbed through untouched', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness initial={{ 34: { ownedQuantity: 400 } }} onChange={onChange} />);

    await user.tab();
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
  });
});

const MENU_MATERIALS: readonly EffectiveMaterial[] = [
  { typeID: 34, baseQuantity: 100, quantity: 100 },
  { typeID: 9840, baseQuantity: 10, quantity: 10 },
];
const MENU_LINES: readonly MaterialCostLine[] = materialCostLines(MENU_MATERIALS, { 34: 10 });

function renderTable(props: Partial<React.ComponentProps<typeof MaterialsTable>> = {}) {
  return render(
    <MemoryRouter>
      <MaterialsTable
        materials={MENU_LINES}
        nameFor={nameFor}
        sourcing={undefined}
        pricesReady
        onSourcingChange={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );
}

/** Mirrors BuildPlanDetail's wiring: the catalog is already in hand, so `blueprintTypeID` is never the "checking…" undefined. */
function menuFor(blueprintByProduct: Record<number, number>, handlers = {}) {
  return function rowContextMenu(material: MaterialCostLine, tr: React.ReactElement) {
    return (
      <ItemContextMenu
        typeId={material.typeID}
        itemName={nameFor(material.typeID)}
        blueprintTypeID={blueprintByProduct[material.typeID] ?? null}
        onAddToQuickbar={vi.fn()}
        quickbarAvailable
        onShowInfo={vi.fn()}
        {...handlers}
      >
        {tr}
      </ItemContextMenu>
    );
  };
}

describe('MaterialsTable', () => {
  it('renders a row per material with quantity, unit price and line total', () => {
    renderTable();
    const rows = screen.getAllByRole('row').slice(1);
    expect(within(rows[0]).getByText('Tritanium')).toBeInTheDocument();
    expect(within(rows[0]).getByText('100')).toBeInTheDocument();
    expect(within(rows[1]).getByText('Mechanical Parts')).toBeInTheDocument();
  });

  it('flags a material with no hub price rather than showing a bogus total', () => {
    renderTable();
    const row = screen.getByText('Mechanical Parts').closest('tr');
    expect(within(row!).getByText('No price')).toBeInTheDocument();
  });

  it('renders rows unwrapped, and stays focus-inert, when no row menu is supplied', () => {
    renderTable();
    const row = screen.getByText('Tritanium').closest('tr');
    expect(row).not.toHaveAttribute('tabindex');
    fireEvent.contextMenu(row!);
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
  });

  describe('row context menu', () => {
    it('opens on right-click with the shared item actions', () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      row!.focus();
      fireEvent.contextMenu(row!);

      expect(screen.getByRole('menuitem', { name: 'Add to Quickbar' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Show info' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Add to Compare' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'View in Market' })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: 'Copy name' })).toBeInTheDocument();
    });

    it('never shows the "checking…" Build Plan label — Industry already holds the catalog', () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      fireEvent.contextMenu(row!);
      expect(screen.getByRole('menuitem', { name: 'Build Plan' })).toBeEnabled();
      expect(
        screen.queryByRole('menuitem', { name: 'Build Plan (checking…)' })
      ).not.toBeInTheDocument();
    });

    it('disables the Build Plan action for a material nothing manufactures', () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Tritanium').closest('tr');
      fireEvent.contextMenu(row!);
      expect(screen.getByRole('menuitem', { name: 'No blueprint options' })).toHaveAttribute(
        'aria-disabled',
        'true'
      );
    });

    it('targets the right-clicked material, not the first row', async () => {
      const user = userEvent.setup();
      const onShowInfo = vi.fn();
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }, { onShowInfo }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      fireEvent.contextMenu(row!);
      await user.click(screen.getByRole('menuitem', { name: 'Show info' }));
      expect(onShowInfo).toHaveBeenCalledWith(9840, 'Mechanical Parts');
    });
  });
});

describe('MaterialsTable detected owned stock (issue #181)', () => {
  const CHARACTER_NAMES: Record<number, string> = { 91: 'Main Pilot', 92: 'Alt Pilot' };
  const LOCATION_NAMES: Record<number, string> = {
    60003760: 'Jita IV - Moon 4',
    60008494: 'Amarr',
  };

  function placement(
    characterId: number,
    locationId: number,
    quantity: number
  ): OwnedStockPlacement {
    return { characterId, locationId, locationType: 'station', quantity };
  }

  function detectionOf(
    stock: Record<number, { quantity: number; placements?: OwnedStockPlacement[] }>,
    overrides: Partial<OwnedStockDetection> = {}
  ): OwnedStockDetection {
    return {
      stockFor: (typeID) => {
        const entry = stock[typeID];
        return entry ? { quantity: entry.quantity, placements: entry.placements ?? [] } : undefined;
      },
      lowerBound: false,
      incompleteCharacters: [],
      characterNameFor: (characterId) => CHARACTER_NAMES[characterId] ?? 'Unknown',
      locationLabelFor: (p) => LOCATION_NAMES[p.locationId] ?? `Station #${p.locationId}`,
      ...overrides,
    };
  }

  const TRIT_STOCK = {
    34: {
      quantity: 9000,
      placements: [placement(91, 60003760, 6000), placement(92, 60008494, 3000)],
    },
  };

  it('shows the detected total beside the Owned input, and none for a material without stock', () => {
    render(<Harness detection={detectionOf(TRIT_STOCK)} />);

    expect(
      within(row('Tritanium')).getByRole('button', { name: 'Detected owned stock for Tritanium' })
    ).toHaveTextContent('9,000 owned');
    expect(
      within(row('Pyerite')).queryByRole('button', { name: /Detected owned stock/ })
    ).not.toBeInTheDocument();
  });

  it('persists nothing by merely rendering a detection', () => {
    const onChange = vi.fn();
    render(<Harness detection={detectionOf(TRIT_STOCK)} onChange={onChange} />);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('writes min(detected, required) — the same value typing it would store', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness detection={detectionOf(TRIT_STOCK)} onChange={onChange} />);

    await user.click(within(row('Tritanium')).getByRole('button', { name: /^Use detected/ }));

    // 9,000 detected against a 1,000-unit requirement.
    expect(onChange).toHaveBeenCalledWith(34, { ownedQuantity: 1000 });
    expect(within(row('Tritanium')).getByLabelText('Owned quantity for Tritanium')).toHaveValue(
      1000
    );
  });

  it('drops the use action once the row already holds the clamped suggestion', () => {
    render(
      <Harness initial={{ 34: { ownedQuantity: 1000 } }} detection={detectionOf(TRIT_STOCK)} />
    );

    expect(
      within(row('Tritanium')).queryByRole('button', { name: /^Use detected/ })
    ).not.toBeInTheDocument();
  });

  it('breaks the total down by Character and location', async () => {
    const user = userEvent.setup();
    render(<Harness detection={detectionOf(TRIT_STOCK)} />);

    await user.click(
      within(row('Tritanium')).getByRole('button', { name: 'Detected owned stock for Tritanium' })
    );

    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Main Pilot — Jita IV - Moon 4');
    expect(menu).toHaveTextContent('Alt Pilot — Amarr');
  });

  it('caps the breakdown at five locations with a remainder line', async () => {
    const user = userEvent.setup();
    const placements = Array.from({ length: 7 }, (_, i) => placement(91, 70000000 + i, 100 - i));
    render(<Harness detection={detectionOf({ 34: { quantity: 700, placements } })} />);

    await user.click(
      within(row('Tritanium')).getByRole('button', { name: 'Detected owned stock for Tritanium' })
    );

    expect(within(screen.getByRole('menu')).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('menu')).toHaveTextContent('and 2 more');
  });

  it('renders an incomplete detection as a lower bound and names the Characters behind it', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        detection={detectionOf(TRIT_STOCK, {
          lowerBound: true,
          incompleteCharacters: ['Alt Pilot', 'No Scope Pilot'],
        })}
      />
    );

    const trigger = within(row('Tritanium')).getByRole('button', {
      name: 'Detected owned stock for Tritanium',
    });
    expect(trigger).toHaveTextContent('≥ 9,000 owned');

    await user.click(trigger);
    expect(screen.getByRole('menu')).toHaveTextContent(
      'Asset data is incomplete for Alt Pilot, No Scope Pilot'
    );
  });
});
