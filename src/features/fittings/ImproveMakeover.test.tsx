import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import { ImproveMakeover } from './ImproveMakeover';
import {
  BEFORE,
  MAKEOVER,
  MAKEOVER_KEYS,
  rowCostOf,
  SINGLE_GAINS,
  typeNameOf,
} from './improveMakeoverFixture';

function Harness({ initial = MAKEOVER_KEYS }: { initial?: string[] }) {
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set(initial));
  return (
    <ImproveMakeover
      makeover={MAKEOVER}
      before={BEFORE}
      ticked={ticked}
      onToggle={(keys, checked) =>
        setTicked((current) => {
          const next = new Set(current);
          for (const key of keys) {
            if (checked) next.add(key);
            else next.delete(key);
          }
          return next;
        })
      }
      singleGains={SINGLE_GAINS}
      rounds={4}
      typeName={typeNameOf}
      rowCost={rowCostOf}
    />
  );
}

describe('ImproveMakeover', () => {
  it('groups rows under the fitted module and shows the figures', () => {
    render(<Harness />);
    expect(screen.getByText('2× Shield Power Relay II split into')).toBeInTheDocument();
    expect(screen.getByText('3× Medium Core Defense Field Purger II become')).toBeInTheDocument();
    expect(screen.getByText('3× Medium Core Defense Field Extender II')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Found in 4 rounds. The figures are the whole Makeover, recalculated as one fit.'
      )
    ).toBeInTheDocument();
    expect(screen.getByText('+202.0%')).toBeInTheDocument();
    expect(screen.getByText('135,600')).toBeInTheDocument();
    expect(screen.getByText(/full price: the old rigs are destroyed/)).toBeInTheDocument();
  });

  it('a row that sells for more than it costs says what it saves', () => {
    render(
      <ImproveMakeover
        makeover={MAKEOVER}
        before={BEFORE}
        ticked={new Set(MAKEOVER_KEYS)}
        onToggle={() => {}}
        typeName={typeNameOf}
        rowCost={() => -40_800}
      />
    );
    expect(screen.getAllByText(/^Saves/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/^Costs/)).not.toBeInTheDocument();
  });

  it('a rig put into an empty slot destroys nothing, so it gets no destroyed-rig note', () => {
    const fill = {
      fromTypeId: null,
      toTypeId: 31796,
      at: [{ slot: 'rig' as const, slotIndex: 2 }],
    };
    render(
      <ImproveMakeover
        makeover={{ ...MAKEOVER, rows: [fill] }}
        before={BEFORE}
        ticked={new Set()}
        onToggle={() => {}}
        typeName={typeNameOf}
        rowCost={() => 1_000_000}
      />
    );
    expect(screen.queryByText(/old rigs are destroyed/)).not.toBeInTheDocument();
  });

  it('shows how long the capacitor lasts, so running dry later reads as better', () => {
    const dry = (seconds: number) =>
      ({
        ...BEFORE,
        capacitor: { stable: false, stablePercentage: 0, depletesInSeconds: seconds },
      }) as typeof BEFORE;
    render(
      <ImproveMakeover
        makeover={{ ...MAKEOVER, after: dry(675) }}
        before={dry(236)}
        ticked={new Set(MAKEOVER_KEYS)}
        onToggle={() => {}}
        typeName={typeNameOf}
        rowCost={rowCostOf}
      />
    );
    expect(screen.getByText('3m 56s')).toBeInTheDocument();
    const after = screen.getByText('11m 15s');
    expect(after.className).toMatch(/text-success/);
  });

  it('shows a stable capacitor as its level', () => {
    render(<Harness />);
    expect(screen.getAllByText('60%').length).toBeGreaterThan(0);
  });

  it("hides each row's own gain while the whole group is ticked", () => {
    render(<Harness />);
    expect(screen.queryByText(/On its own/)).toBeNull();
  });

  it('unticking a row leaves the group partly ticked and shows the own gains', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Damage Control II/ }));
    const group = screen.getByRole('checkbox', { name: /Makeover/ });
    expect(group).not.toBeChecked();
    expect((group as HTMLInputElement).indeterminate).toBe(true);
    expect(screen.getByText('Makeover, 3 of 4 changes ticked')).toBeInTheDocument();
    expect(screen.getByText('On its own +41.0%')).toBeInTheDocument();
  });

  it('ticking the group ticks every row, and again unticks them all', async () => {
    render(<Harness initial={[]} />);
    const group = screen.getByRole('checkbox', { name: /Makeover/ });
    await userEvent.click(group);
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeChecked();
    await userEvent.click(group);
    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });

  it('a partly ticked group ticks the rest when clicked', async () => {
    render(<Harness initial={[MAKEOVER_KEYS[0]!]} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Makeover/ }));
    for (const box of screen.getAllByRole('checkbox')) expect(box).toBeChecked();
  });
});
