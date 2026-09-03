import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { materialCostLines } from '@/engine/industry/sourcing';
import type {
  EffectiveMaterial,
  HubPrices,
  MaterialSourcing,
  MaterialSourcingMap,
} from '@/engine/industry/types';
import { applySourcingPatch } from './sourcingEdits';
import { MaterialsTable } from './MaterialsTable';

const MATERIALS: readonly EffectiveMaterial[] = [
  { typeID: 34, baseQuantity: 1000, quantity: 1000 },
  { typeID: 35, baseQuantity: 200, quantity: 200 },
];
const HUB_PRICES: HubPrices = { 34: 5, 35: 10 };
const NAMES: Record<number, string> = { 34: 'Tritanium', 35: 'Pyerite' };

interface HarnessProps {
  initial?: MaterialSourcingMap;
  hubPrices?: HubPrices;
  pricesReady?: boolean;
  onChange?: (typeID: number, patch: MaterialSourcing) => void;
}

/**
 * Stands in for BuildPlanDetail: holds the sourcing map an edit patches and
 * re-prices through the same engine call the real panel uses, so a test can
 * assert what an edit does to the row rather than only that a callback fired.
 */
function Harness({ initial, hubPrices = HUB_PRICES, pricesReady = true, onChange }: HarnessProps) {
  const [sourcing, setSourcing] = useState<MaterialSourcingMap | undefined>(initial);
  return (
    <MaterialsTable
      materials={materialCostLines(MATERIALS, hubPrices, sourcing)}
      nameFor={(typeID) => NAMES[typeID] ?? String(typeID)}
      sourcing={sourcing}
      pricesReady={pricesReady}
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
