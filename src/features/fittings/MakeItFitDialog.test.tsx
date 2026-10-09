import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { FitOption } from '@/engine/fittings/makeItFit';
import type { FittingStats } from '@/engine/fittings/types';
import { MakeItFitDialog } from './MakeItFitDialog';
import type { FittingCatalogue } from './useFittingCatalogue';

const mocks = vi.hoisted(() => ({ state: {} as Record<string, unknown> }));
vi.mock('./useMakeItFit', () => ({ useMakeItFit: () => mocks.state }));
vi.mock('./useFittingCatalogue', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./useFittingCatalogue')>()),
  catalogueTypeName: (_catalogue: unknown, typeId: number) =>
    ({ 1: 'Gyrostabilizer I', 2: 'Gyrostabilizer II', 3: 'Power Diagnostic' })[typeId] ?? '?',
}));

const stats = (ehp: number, shieldEm: number): FittingStats =>
  ({ ehp, shield: { emResonance: 1 - shieldEm / 100 } }) as unknown as FittingStats;

vi.mock('@/engine/fittings/variationDelta', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/fittings/variationDelta')>()),
  diffFittingStats: (_before: FittingStats, after: FittingStats & { delta: unknown[] }) => ({
    changes: after.delta,
    count: after.delta.length,
  }),
}));
function option(
  slotIndex: number,
  iskDelta: number | null,
  delta: { key: string; before: number; after: number }[]
): FitOption {
  return {
    swaps: [{ slot: 'medium', slotIndex, fromTypeId: 1, toTypeId: 2 }],
    after: { ...stats(0, 0), delta } as never,
    iskDelta,
  } as unknown as FitOption;
}

function renderDialog(
  options: FitOption[],
  props: { nothingFits?: boolean; onOpenList?: () => void } = {}
) {
  mocks.state = {
    failed: false,
    before: stats(0, 0),
    result: { options, nothingFits: props.nothingFits ?? false },
  };
  const onApply = vi.fn();
  render(
    <MakeItFitDialog
      open
      onClose={vi.fn()}
      variants={null}
      catalogue={{} as FittingCatalogue}
      onApply={onApply}
      onOpenList={props.onOpenList}
      placement="center"
    />
  );
  return onApply;
}

const ehpDown = { key: 'ehp', before: 1000, after: 707 };
const emResist = { key: 'shieldEmResonance', before: 50, after: 42 };
const thermalResist = { key: 'shieldThermalResonance', before: 40, after: 34 };

describe('MakeItFitDialog', () => {
  it('summarises each trade-off in a line, with every number in an expander', async () => {
    renderDialog([option(0, 1000, [ehpDown, emResist, thermalResist])]);
    expect(screen.getByText('EHP -293, resists lower')).toBeTruthy();
    // The per-resist numbers are one click away, not gone.
    expect(screen.queryByText('Shield EM resist -8%')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'All changes' }));
    expect(screen.getByText('Shield EM resist -8%')).toBeTruthy();
    expect(screen.getByText('Shield thermal resist -6%')).toBeTruthy();
  });

  it('says "no price" once for the list, not on every row', () => {
    renderDialog([option(0, null, [ehpDown]), option(1, null, [ehpDown])]);
    expect(screen.getAllByText('Options without a price show no cost.')).toHaveLength(1);
  });

  it('tells identical-looking rows apart by their slot', () => {
    renderDialog([option(0, 10, [ehpDown]), option(1, 10, [ehpDown])]);
    expect(screen.getByText(/Mid slot 1/)).toBeTruthy();
    expect(screen.getByText(/Mid slot 2/)).toBeTruthy();
  });

  it('leaves a lone row without a slot suffix', () => {
    renderDialog([option(0, 10, [ehpDown])]);
    expect(screen.queryByText(/Mid slot/)).toBeNull();
  });

  it('applies the option when its row is clicked', () => {
    const onApply = renderDialog([option(0, 10, [ehpDown])]);
    fireEvent.click(screen.getByRole('button', { name: /Gyrostabilizer I → Gyrostabilizer II/ }));
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('points an empty result at the module List', async () => {
    const onOpenList = vi.fn();
    renderDialog([], { nothingFits: true, onOpenList });
    await userEvent.click(screen.getByRole('button', { name: 'Open the module List' }));
    expect(onOpenList).toHaveBeenCalledOnce();
  });

  it('offers no List pointer when the List is already showing', () => {
    renderDialog([], { nothingFits: true });
    expect(screen.queryByRole('button', { name: 'Open the module List' })).toBeNull();
  });
});
