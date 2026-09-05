import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
import type { PiData } from '@/sde/types';
import type { MakeOrBuy } from '@/engine/industry/makeOrBuy';
import { FACILITY_PRESETS } from '@/engine/industry/types';
import { planSubBuild } from '@/engine/industry/subBuild';
import { applySourcingPatch } from './sourcingEdits';
import { MaterialsTable } from './MaterialsTable';
import type { OwnedStockDetection } from './ownedStockDetection';

// The row menu's PI action reads `pi.json` for itself; the real payload keeps
// "is 9840 planetary" an answer the SDE gives rather than one this file makes up.
vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(
    async () =>
      JSON.parse(readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')) as PiData
  ),
}));

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

// Textboxes, not spinbuttons: the fields mask their value ("338,600"), which
// a `type="number"` input cannot hold.
const ownedInput = (material: string) =>
  screen.getByRole('textbox', { name: `Owned quantity for ${material}` });
const priceInput = (material: string) =>
  screen.getByRole('textbox', { name: `Price for ${material}` });
const revertButton = (material: string) =>
  screen.getByRole('button', { name: `Reset ${material} to the hub price` });
const queryRevertButton = (material: string) =>
  screen.queryByRole('button', { name: `Reset ${material} to the hub price` });
const valueOf = (input: HTMLElement) => (input as HTMLInputElement).value;

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
    // The hub price is the field's value, not a separate read-only column:
    // one price per row, already filled in, and editing it is the override.
    expect(valueOf(priceInput('Tritanium'))).toBe('5');
    expect(tritanium.getByText('5,000')).toBeTruthy();
    expect(tritanium.getByText('Hub')).toBeTruthy();
    // Nothing to revert to — the row is already showing the market's number.
    expect(queryRevertButton('Tritanium')).toBeNull();
  });

  it('falls back to placeholder text for every row when prices could not be loaded', () => {
    render(<Harness pricesReady={false} />);
    const tritanium = within(row('Tritanium'));
    expect(tritanium.getByText('No price')).toBeTruthy();
    expect(tritanium.getByText('—')).toBeTruthy();
    // Empty rather than 0: the market has no number for this row, and a
    // filled-in 0 would read as a price.
    expect(valueOf(priceInput('Tritanium'))).toBe('');
  });

  it('keeps showing an override price when prices could not be loaded', () => {
    // The override is the player's own number, so no market data is needed to
    // price the row — and the results panel already counts it.
    render(<Harness initial={{ 34: { overridePrice: 7 } }} pricesReady={false} />);
    const tritanium = within(row('Tritanium'));
    expect(valueOf(priceInput('Tritanium'))).toBe('7');
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
    // The number the player typed is kept — it is not an error to fix — and
    // comes back masked, since 5000 is what they typed but 5,000 is what the
    // field shows once they leave it.
    expect((ownedInput('Tritanium') as HTMLInputElement).value).toBe('5,000');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(tritanium.queryByText('No price')).toBeNull();
  });

  it('an override price replaces the hub price for the row', async () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await setField(priceInput('Tritanium'), '7');

    expect(onChange).toHaveBeenCalledWith(34, { overridePrice: 7 });
    const tritanium = within(row('Tritanium'));
    expect(valueOf(priceInput('Tritanium'))).toBe('7');
    expect(tritanium.getByText('7,000')).toBeTruthy();
    expect(tritanium.getByText('Override')).toBeTruthy();
  });

  it('clearing an override price reverts the row to the hub price', async () => {
    const onChange = vi.fn();
    render(<Harness initial={{ 34: { overridePrice: 7 } }} onChange={onChange} />);
    expect(within(row('Tritanium')).getByText('7,000')).toBeTruthy();

    await setField(priceInput('Tritanium'), '');

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
    expect(document.activeElement).toBe(priceInput('Tritanium'));
    expect(onChange).toHaveBeenCalledWith(34, { ownedQuantity: 250 });
    expect(within(row('Tritanium')).getByText('250 owned + 750 x 5')).toBeTruthy();
  });

  it('keeps a visible focus ring on both editable inputs', () => {
    render(<Harness />);
    for (const input of [ownedInput('Tritanium'), priceInput('Tritanium')]) {
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

/**
 * Below `sm` a `DataTable` row is not a row but a stacked card: each column
 * header prints into a left gutter and its value starts where every other
 * value on the card starts (docs/DESIGN.md §4a). A cell that right-aligns its
 * own content opts out of that column, which is what made the materials card
 * on a phone read as a zigzag — the quantity at the gutter, an input hard
 * against the card's right edge, the line total somewhere between the two. So
 * every wrapper here holds its end-alignment behind `sm:`.
 */
describe('MaterialsTable stacked card', () => {
  function cell(material: string, label: string): HTMLElement {
    const found = row(material).querySelector(`[data-label="${label}"]`);
    if (!found) throw new Error(`no ${label} cell for ${material}`);
    return found as HTMLElement;
  }

  it('starts every value at the card gutter below sm and right-aligns it from sm up', () => {
    render(<Harness />);
    const tritanium = within(row('Tritanium'));

    expect(ownedInput('Tritanium').parentElement).toHaveClass('items-start', 'sm:items-end');
    expect(cell('Tritanium', 'Line total').firstElementChild).toHaveClass(
      'items-start',
      'sm:items-end'
    );
    // The price cell reaches the same right edge by mirroring rather than by
    // `justify-end` — see the alignment test below — so what matters here is
    // that it starts at the gutter on the card like everything else.
    expect(tritanium.getByText('Hub').parentElement).toHaveClass('justify-start');
  });

  it('left-aligns the digits inside a sourcing field below sm, so they sit in the value column too', () => {
    render(<Harness />);

    for (const input of [ownedInput('Tritanium'), priceInput('Tritanium')]) {
      expect(input).toHaveClass('text-left', 'sm:text-right');
    }
  });

  it('shows 0 in an empty owned field instead of an unexplained empty box', () => {
    render(<Harness />);

    // Placeholder only: an empty owned field still means "not set", and 0 is
    // what not setting it comes to. The price field carries no placeholder —
    // it is filled with the market price, and a ghost 0 on the rows that have
    // no price at all would read as free.
    expect(ownedInput('Tritanium')).toHaveAttribute('placeholder', '0');
    expect(valueOf(ownedInput('Tritanium'))).toBe('');
    expect(priceInput('Tritanium')).not.toHaveAttribute('placeholder');
  });
});

/**
 * The mask (`src/lib/numberMask.ts`): a column of prices is unreadable as
 * `338600` beside `6622`, but a box being typed into is unusable if a
 * formatter rewrites the digits under the caret. So the field groups at rest
 * and shows the plain number while it has focus.
 */
describe('MaterialsTable number mask', () => {
  const BIG_PRICES: HubPrices = { 34: 338600, 35: 6622.35 };

  it('groups the digits at rest, in both sourcing fields', () => {
    render(<Harness hubPrices={BIG_PRICES} initial={{ 34: { ownedQuantity: 1000 } }} />);

    expect(valueOf(priceInput('Tritanium'))).toBe('338,600');
    expect(valueOf(ownedInput('Tritanium'))).toBe('1,000');
  });

  it("keeps a price's own decimals rather than rounding them away", () => {
    // The line total beside it is whole ISK; the field is the player's number
    // and has to come back as they left it.
    render(<Harness hubPrices={BIG_PRICES} />);

    expect(valueOf(priceInput('Pyerite'))).toBe('6,622.35');
  });

  it('swaps the mask for a plain number to type into, and puts it back on the way out', async () => {
    const user = userEvent.setup();
    render(<Harness hubPrices={BIG_PRICES} />);

    await user.click(priceInput('Tritanium'));
    expect(valueOf(priceInput('Tritanium'))).toBe('338600');

    await user.tab();
    expect(valueOf(priceInput('Tritanium'))).toBe('338,600');
  });

  it('stores no override for a masked field merely clicked into and left', async () => {
    // The guard that keeps the market default a default has to survive the
    // mask: what is compared on blur is the typed string, not the shown one.
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness hubPrices={BIG_PRICES} onChange={onChange} />);

    await user.click(priceInput('Tritanium'));
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(within(row('Tritanium')).getByText('Hub')).toBeTruthy();
  });

  it('does not pin a stale price when the market refreshes under a focused field', async () => {
    // The trap in unmasking on focus: the plain number would be frozen into
    // the draft on the way in, so a snapshot landing mid-edit would be
    // committed on blur as an override of the price that just expired. Until
    // a key is pressed the prop stays the source of truth.
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<Harness hubPrices={BIG_PRICES} onChange={onChange} />);

    await user.click(priceInput('Tritanium'));
    rerender(<Harness hubPrices={{ ...BIG_PRICES, 34: 401000 }} onChange={onChange} />);
    expect(valueOf(priceInput('Tritanium'))).toBe('401000');

    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(valueOf(priceInput('Tritanium'))).toBe('401,000');
    expect(within(row('Tritanium')).getByText('Hub')).toBeTruthy();
  });

  it('puts the field on the cell edge the PRICE header is aligned to', async () => {
    // The header is right-aligned to the cell, so whatever sits last in the
    // cell is what PRICE ends up over. With the field first and the tag and
    // revert control after it, the header floated a `Hub ↺` clear of the
    // digits it names. Mirroring from `sm` up puts the field last on the wide
    // table while the card keeps reading field-first.
    render(<Harness hubPrices={BIG_PRICES} onChange={vi.fn()} />);

    const cell = priceInput('Tritanium').parentElement;
    expect(cell).toHaveClass('sm:flex-row-reverse');
    expect(cell?.firstElementChild).toBe(priceInput('Tritanium'));

    // And it holds once a row grows a revert button: the field is a fixed
    // width against a fixed edge, so nothing beside it can move it.
    await setField(priceInput('Tritanium'), '7');
    expect(revertButton('Tritanium')).toBeInTheDocument();
    expect(priceInput('Tritanium').parentElement?.firstElementChild).toBe(priceInput('Tritanium'));
  });

  it('accepts a separator the player types or pastes', async () => {
    const onChange = vi.fn();
    render(<Harness hubPrices={BIG_PRICES} onChange={onChange} />);

    await setField(priceInput('Tritanium'), '1,250,000');

    expect(onChange).toHaveBeenCalledWith(34, { overridePrice: 1250000 });
    expect(valueOf(priceInput('Tritanium'))).toBe('1,250,000');
  });
});

describe('MaterialsTable price field', () => {
  it('reverts to the hub price from the button, which is only there once a row is overridden', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    expect(queryRevertButton('Tritanium')).toBeNull();

    await setField(priceInput('Tritanium'), '7');
    expect(valueOf(priceInput('Tritanium'))).toBe('7');

    await user.click(revertButton('Tritanium'));

    expect(onChange).toHaveBeenLastCalledWith(34, { overridePrice: undefined });
    const tritanium = within(row('Tritanium'));
    expect(valueOf(priceInput('Tritanium'))).toBe('5');
    expect(tritanium.getByText('Hub')).toBeTruthy();
    expect(tritanium.getByText('5,000')).toBeTruthy();
    // Back to tracking the market, so there is nothing left to revert.
    expect(queryRevertButton('Tritanium')).toBeNull();
  });

  it('leaves the other rows alone when one is reverted', async () => {
    const user = userEvent.setup();
    render(<Harness initial={{ 34: { overridePrice: 7 }, 35: { overridePrice: 12 } }} />);

    await user.click(revertButton('Tritanium'));

    expect(valueOf(priceInput('Pyerite'))).toBe('12');
    expect(within(row('Pyerite')).getByText('Override')).toBeTruthy();
  });

  it('stores no override for a row merely tabbed across, so it keeps tracking the market', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    // Owned, then price, then out of the row — the price field holds the hub
    // price the whole way, and a blur must not freeze it into the plan.
    await user.tab();
    await user.tab();
    await user.tab();

    expect(onChange).not.toHaveBeenCalled();
    expect(within(row('Tritanium')).getByText('Hub')).toBeTruthy();
    expect(queryRevertButton('Tritanium')).toBeNull();
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

    it('offers a PI Plan for a material planetary industry makes (Transmitter, P2)', async () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Mechanical Parts').closest('tr');
      fireEvent.contextMenu(row!);
      expect(await screen.findByRole('menuitem', { name: 'PI Plan' })).toBeInTheDocument();
    });

    it('offers no PI Plan for a material no factory makes', async () => {
      renderTable({ rowContextMenu: menuFor({ 9840: 9841 }) });
      const row = screen.getByText('Tritanium').closest('tr');
      fireEvent.contextMenu(row!);
      expect(
        await screen.findByRole('menuitem', { name: 'No blueprint options' })
      ).toBeInTheDocument();
      expect(screen.queryByRole('menuitem', { name: 'PI Plan' })).not.toBeInTheDocument();
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
      // Defaults to the same total as `stockFor` — the "everywhere" scope,
      // and today's only behavior before per-location scoping (#454) existed.
      scopedQuantityFor: (typeID) => stock[typeID]?.quantity ?? 0,
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
      within(row('Tritanium')).getByRole('button', { name: /detected for Tritanium/ })
    ).toHaveTextContent('9,000 owned');
    expect(
      within(row('Pyerite')).queryByRole('button', { name: /detected for/ })
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

    await user.click(
      within(row('Tritanium')).getByRole('button', {
        name: 'Use 1,000 detected owned for Tritanium',
      })
    );

    // 9,000 detected against a 1,000-unit requirement.
    expect(onChange).toHaveBeenCalledWith(34, { ownedQuantity: 1000 });
    expect(within(row('Tritanium')).getByLabelText('Owned quantity for Tritanium')).toHaveValue(
      '1,000'
    );
  });

  it('drops the use action once the row already holds the clamped suggestion', () => {
    render(
      <Harness initial={{ 34: { ownedQuantity: 1000 } }} detection={detectionOf(TRIT_STOCK)} />
    );

    expect(
      within(row('Tritanium')).queryByRole('button', {
        name: 'Use 1,000 detected owned for Tritanium',
      })
    ).not.toBeInTheDocument();
  });

  it('breaks the total down by Character and location', async () => {
    const user = userEvent.setup();
    render(<Harness detection={detectionOf(TRIT_STOCK)} />);

    await user.click(
      within(row('Tritanium')).getByRole('button', { name: /detected for Tritanium/ })
    );

    const menu = screen.getByRole('dialog');
    expect(menu).toHaveTextContent('Main Pilot — Jita IV - Moon 4');
    expect(menu).toHaveTextContent('Alt Pilot — Amarr');
  });

  it('caps the breakdown at five locations with a remainder line', async () => {
    const user = userEvent.setup();
    const placements = Array.from({ length: 7 }, (_, i) => placement(91, 70000000 + i, 100 - i));
    render(<Harness detection={detectionOf({ 34: { quantity: 700, placements } })} />);

    await user.click(
      within(row('Tritanium')).getByRole('button', { name: /detected for Tritanium/ })
    );

    expect(within(screen.getByRole('dialog')).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.getByRole('dialog')).toHaveTextContent('and 2 more');
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
      name: /detected for Tritanium/,
    });
    expect(trigger).toHaveTextContent('≥ 9,000 owned');

    await user.click(trigger);
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'Asset data is incomplete for Alt Pilot, No Scope Pilot'
    );
  });

  it('scopes the headline and the "use detected" offer to selected locations, but keeps the full breakdown (#454)', async () => {
    const user = userEvent.setup();
    // Full detected total is 9,000 across two locations; the plan's scope
    // only counts the 6,000 held by Main Pilot at Jita.
    render(
      <Harness
        detection={detectionOf(TRIT_STOCK, {
          scopedQuantityFor: (typeID) => (typeID === 34 ? 6000 : 0),
        })}
      />
    );

    const trigger = within(row('Tritanium')).getByRole('button', {
      name: /detected for Tritanium/,
    });
    expect(trigger).toHaveTextContent('6,000 owned');

    await user.click(trigger);
    const menu = screen.getByRole('dialog');
    // The breakdown still lists every placement, including the one outside
    // the plan's selected scope, so the player sees the full picture.
    expect(menu).toHaveTextContent('Main Pilot — Jita IV - Moon 4');
    expect(menu).toHaveTextContent('Alt Pilot — Amarr');

    expect(
      within(row('Tritanium')).getByRole('button', {
        name: 'Use 1,000 detected owned for Tritanium',
      })
    ).toBeInTheDocument();
  });

  it('shows "0 owned" with no use action when a material\'s stock all sits outside the selected scope (#454)', async () => {
    const user = userEvent.setup();
    // Real stock exists (9,000 across two locations), but none of it is
    // inside the plan's selected locations — a state that could not occur
    // before per-location scoping existed.
    render(<Harness detection={detectionOf(TRIT_STOCK, { scopedQuantityFor: () => 0 })} />);

    const trigger = within(row('Tritanium')).getByRole('button', {
      name: /detected for Tritanium/,
    });
    expect(trigger).toHaveTextContent('0 owned');
    expect(
      within(row('Tritanium')).queryByRole('button', { name: /^Use \d/ })
    ).not.toBeInTheDocument();

    // The breakdown still shows the full, unfiltered picture.
    await user.click(trigger);
    const menu = screen.getByRole('dialog');
    expect(menu).toHaveTextContent('Main Pilot — Jita IV - Moon 4');
    expect(menu).toHaveTextContent('Alt Pilot — Amarr');
  });
});

describe('MaterialsTable make-or-buy marker', () => {
  const buildIt: MakeOrBuy = {
    method: 'manufacturing',
    verdict: 'build',
    makeUnitPrice: 42.96,
    buyUnitPrice: 50,
    savings: 70.4,
    me: 0,
  };

  function advise(advice: MakeOrBuy, typeID = 9840) {
    return { makeOrBuy: new Map([[typeID, advice]]) };
  }

  it('marks a material worth building, spelling out both prices', () => {
    renderTable(advise(buildIt));
    const marker = within(row('Mechanical Parts')).getByRole('img');
    expect(marker).toHaveAccessibleName(/^Cheaper to build: 42\.96 a unit to manufacture at ME 0%/);
    expect(marker).toHaveAccessibleName(/against 50\.00 to buy/);
    expect(marker).toHaveAccessibleName(/Worth 70 across the 10 units still to buy/);
  });

  it('marks a material worth buying with a different glyph, not a different colour', () => {
    const buy = renderTable(advise({ ...buildIt, verdict: 'buy', makeUnitPrice: 60 }));
    expect(within(row('Mechanical Parts')).getByRole('img')).toHaveAccessibleName(
      /^Cheaper to buy: 50\.00 a unit/
    );
    // The opposite verdict has to differ in shape, not only in tone
    // (docs/DESIGN.md §7) — each render is scoped to its own container, the
    // two coexist in the document.
    const build = renderTable(advise(buildIt));
    const glyph = (c: HTMLElement) => c.querySelector('[role="img"] svg')?.innerHTML;
    expect(glyph(buy.container)).toBeTruthy();
    expect(glyph(buy.container)).not.toEqual(glyph(build.container));
  });

  it('names planetary industry rather than manufacturing for a schematic', () => {
    renderTable(advise({ ...buildIt, method: 'planetary', me: null }));
    expect(within(row('Mechanical Parts')).getByRole('img')).toHaveAccessibleName(
      /Cheaper to make with planetary industry: 42\.96 a unit in inputs/
    );
  });

  it('gives a planetary build its own glyph, distinct from a manufacturing one', () => {
    // "Build this" means two different errands — an industry slot or a colony —
    // and one hammer for both never said which. Shape, not only tone, again.
    const planetary = renderTable(advise({ ...buildIt, method: 'planetary', me: null }));
    const manufacturing = renderTable(advise(buildIt));
    const glyph = (c: HTMLElement) => c.querySelector('[role="img"] svg')?.innerHTML;
    expect(glyph(planetary.container)).toBeTruthy();
    expect(glyph(planetary.container)).not.toEqual(glyph(manufacturing.container));
  });

  it('leaves a material with no verdict unmarked', () => {
    renderTable(advise(buildIt));
    expect(within(row('Tritanium')).queryByRole('img')).toBeNull();
  });

  it('renders no marker at all when the caller passes no verdicts', () => {
    renderTable();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('drops the savings clause from a fully owned row — nothing is riding on it', () => {
    renderTable({
      materials: materialCostLines(MENU_MATERIALS, { 34: 10 }, { 9840: { ownedQuantity: 10 } }),
      ...advise({ ...buildIt, savings: 0 }),
    });
    expect(within(row('Mechanical Parts')).getByRole('img')).not.toHaveAccessibleName(/Worth/);
  });

  it('reveals the house Tooltip bubble on hover, not a bare browser title', async () => {
    renderTable(advise(buildIt));
    const marker = within(row('Mechanical Parts')).getByRole('img');
    // A native `title` fights the app's own tooltip — the browser draws its
    // unstyled one a beat after Radix draws ours, so this has to be gone,
    // not merely duplicated by the real thing.
    expect(marker).not.toHaveAttribute('title');
    expect(screen.queryByRole('tooltip')).toBeNull();

    fireEvent.pointerMove(marker);

    // Radix's first hover in a session goes through its own open delay
    // (zeroed, but still a real timer) rather than opening synchronously —
    // `findByRole` is what `Tooltip.test.tsx`'s own hover case waits on too.
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/Cheaper to build: 42\.96 a unit/);
    expect(marker).toHaveAttribute('aria-describedby', tooltip.id);
  });

  it('never takes a tab stop on a material nothing here can produce — a marker has nothing to click', async () => {
    // `fireEvent.focus` fires React's handler on whatever node it targets,
    // focusable or not, so it can't tell this apart from a real tab stop —
    // it would pass just as well on a `<button>`, which is the mistake this
    // guards against (every other `Tooltip` call in the app wraps one).
    // `userEvent.tab()` walks focus the way a browser actually does, landing
    // only on elements the platform considers focusable. No `canBuildHere` is
    // passed here, so the marker slot stays the plain advisory glyph — see
    // the "build-here control" describe block below for the case where it is
    // a real button instead.
    const user = userEvent.setup();
    renderTable(advise(buildIt));
    const marker = within(row('Mechanical Parts')).getByRole('img');
    expect(marker).not.toHaveAttribute('tabindex');

    for (let i = 0; i < 4; i++) {
      await user.tab();
      expect(document.activeElement).not.toBe(marker);
    }
  });
});

describe('MaterialsTable build-here control', () => {
  const PARTS_BLUEPRINT = {
    name: 'Mechanical Parts Blueprint',
    time: 1800,
    materials: [{ typeID: 35, quantity: 5 }],
    products: [{ typeID: 9840, quantity: 4 }],
  };

  /** A real planned job, so the row renders the numbers the engine would give it. */
  function sub(material: MaterialCostLine) {
    return (
      planSubBuild(material, PARTS_BLUEPRINT, 0, {
        facility: FACILITY_PRESETS.npcStation,
        rig: 'none',
        security: 'highsec',
        systemCostIndex: 0.05,
        adjustedPrices: {},
        skills: {},
      }) ?? undefined
    );
  }

  const buildable = (typeID: number) => typeID === 9840;

  /** MENU_LINES with the parts row switched to being produced rather than bought. */
  const building = () =>
    MENU_LINES.map((line) => (line.typeID === 9840 ? { ...line, subBuild: sub(line) } : line));

  it('offers the control only on a material something can produce', () => {
    renderTable({ canBuildHere: buildable, onToggleBuildHere: vi.fn() });

    expect(
      within(row('Mechanical Parts')).getByRole('button', {
        name: 'Build Mechanical Parts here instead of buying it',
      })
    ).toBeInTheDocument();
    expect(within(row('Tritanium')).queryByRole('button', { name: /Build/ })).toBeNull();
  });

  it('is a real tab stop — the marker slot is the control here, not just a status glyph', async () => {
    const user = userEvent.setup();
    renderTable({ canBuildHere: buildable, onToggleBuildHere: vi.fn() });
    const control = within(row('Mechanical Parts')).getByRole('button', {
      name: 'Build Mechanical Parts here instead of buying it',
    });

    let reached = false;
    for (let i = 0; i < 6 && !reached; i++) {
      await user.tab();
      reached = document.activeElement === control;
    }
    expect(reached).toBe(true);
  });

  it('shows no control at all when the caller cannot look recipes up', () => {
    renderTable();

    expect(screen.queryByRole('button', { name: /Build .* here/ })).toBeNull();
  });

  it('reports which material was switched', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderTable({ canBuildHere: buildable, onToggleBuildHere: onToggle });

    await user.click(
      screen.getByRole('button', { name: 'Build Mechanical Parts here instead of buying it' })
    );

    expect(onToggle).toHaveBeenCalledWith(9840);
  });

  it('offers the way back once a material is being built', () => {
    renderTable({ materials: building(), canBuildHere: buildable, onToggleBuildHere: vi.fn() });

    expect(
      screen.getByRole('button', { name: 'Buy Mechanical Parts instead of building it' })
    ).toBeInTheDocument();
  });

  it('colours the hammer green and the cart dim, fixed to the glyph rather than the row', () => {
    // Not yet building: the toggle shows the hammer, green.
    renderTable({ canBuildHere: buildable, onToggleBuildHere: vi.fn() });
    const hammerControl = within(row('Mechanical Parts')).getByRole('button', {
      name: 'Build Mechanical Parts here instead of buying it',
    });
    expect(hammerControl).toHaveClass('text-isk-pos');

    // Already building: the toggle shows the cart, dim — not green, even
    // though this is the row actually being built.
    const buildingRow = renderTable({
      materials: building(),
      canBuildHere: buildable,
      onToggleBuildHere: vi.fn(),
    });
    const cartControl = within(
      within(buildingRow.container).getByText('Mechanical Parts').closest('tr')!
    ).getByRole('button', { name: 'Buy Mechanical Parts instead of building it' });
    expect(cartControl).toHaveClass('text-text-dim');
  });

  it('carries the make-or-buy price rationale into the toggle’s tooltip, keeping the accessible name to the short action', async () => {
    const advice: MakeOrBuy = {
      method: 'manufacturing',
      verdict: 'build',
      makeUnitPrice: 42.96,
      buyUnitPrice: 50,
      savings: 70.4,
      me: 0,
    };
    renderTable({
      canBuildHere: buildable,
      onToggleBuildHere: vi.fn(),
      makeOrBuy: new Map([[9840, advice]]),
    });

    // The accessible name stays the short action — a real tab stop, unlike
    // the advice-only marker's span, so a keyboard user's screen reader
    // isn't reading a paragraph on every Tab.
    const control = within(row('Mechanical Parts')).getByRole('button', {
      name: 'Build Mechanical Parts here instead of buying it',
    });

    fireEvent.pointerMove(control);
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent(/Cheaper to build: 42\.96 a unit/);
    expect(tooltip).toHaveTextContent(/Worth 70 across the 10 units still to buy/);
  });

  it('replaces a built material’s price with the job that produces it', () => {
    renderTable({ materials: building(), canBuildHere: buildable, onToggleBuildHere: vi.fn() });
    const built = row('Mechanical Parts');

    // 10 needed at 4 a run is 3 runs; the per-run yield and spare units that
    // implies are recoverable from the runs count and the indented inputs
    // below, so they no longer get a line of their own.
    expect(within(built).getByText('3 runs')).toBeInTheDocument();
    expect(within(built).queryByText(/per run/)).not.toBeInTheDocument();
    expect(within(built).queryByText(/spare/)).not.toBeInTheDocument();
    expect(within(built).getByText('Built')).toBeInTheDocument();
    // Nothing to price: the cost is the inputs below plus the job fee.
    expect(within(built).queryByLabelText(/^Price for/)).toBeNull();
  });

  it('never offers to build an input that only exists because of another build', () => {
    const rows = [
      ...MENU_LINES,
      {
        ...materialCostLines([{ typeID: 35, baseQuantity: 15, quantity: 15 }], {})[0],
        isSubInput: true,
      },
    ];
    renderTable({ materials: rows, canBuildHere: () => true, onToggleBuildHere: vi.fn() });

    // Both of the plan's own materials offer it; the indented input does not.
    expect(screen.getAllByRole('button', { name: /here instead of buying it$/ })).toHaveLength(2);
    expect(within(row('Pyerite')).queryByRole('button', { name: /Build/ })).toBeNull();
    expect(screen.getByText('Pyerite')).toHaveClass('sm:pl-4');
    // The indent alone reaches a sighted reader at `sm` and up; a screen
    // reader and a narrow stacked card (where `sm:pl-4` is inert) get this
    // instead.
    expect(within(row('Pyerite')).getByText("input to another material's build")).toHaveClass(
      'sr-only'
    );
  });
});
