import { describe, expect, it, vi } from 'vitest';
import { render as rtlRender, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router-dom';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type { Fitting, FittingImplantSet, PilotProfile } from '@/engine/fittings/types';

// Entity names are real links, so every render needs a Router.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: MemoryRouter });

vi.mock('@/features/skills/typeCatalog', () => ({
  loadItemNameMap: async () =>
    new Map([
      ['standard blue pill booster', { typeID: 9950 }],
      ['squire eg-602', { typeID: 13283 }],
      ['squire eg-603', { typeID: 13284 }],
      ['damage control ii', { typeID: 2048 }],
    ]),
}));
// Which slot each item takes; anything else is neither an implant nor a booster.
const SLOTS = new Map([
  [9950, { kind: 'booster', slot: 1 }],
  [13283, { kind: 'implant', slot: 6 }],
  [13284, { kind: 'implant', slot: 6 }],
]);
vi.mock('./useImplantFinder', () => ({
  loadImplantCatalog: async () => ({ families: [], slotOf: (id: number) => SLOTS.get(id) }),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: async () => new Map([[9950, 'Standard Blue Pill Booster']]),
}));
// What the finder is handed, and one change made through it.
vi.mock('./ImplantFinder', () => ({
  ImplantFinder: ({
    fitting,
    implantSet,
    onChange,
  }: {
    fitting: Fitting;
    implantSet: FittingImplantSet;
    onChange: (set: FittingImplantSet) => void;
  }) => (
    <>
      <p>Plan: {implantSet.implants.join(',')}</p>
      <p>Measured on: {fitting.implantSet?.implants.join(',') ?? 'none'}</p>
      <button
        type="button"
        onClick={() => onChange({ ...implantSet, implants: [...implantSet.implants, 999] })}
      >
        Plan one more
      </button>
    </>
  ),
}));

// The item's details, as the dialog that opens on them.
vi.mock('@/features/market/ItemDetailModal', () => ({
  ItemDetailModal: ({ typeId, itemName }: { typeId: number; itemName: string }) => (
    <p>
      Info: {itemName} ({typeId})
    </p>
  ),
}));

const { ImplantSetPicker } = await import('./ImplantSetPicker');

describe('ImplantSetPicker — booster side effects', () => {
  it('switches a carried booster’s side effect on, and off again', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950] }}
        onChange={onChange}
      />
    );

    await user.click(screen.getByRole('checkbox', { name: 'Shield capacity −20%' }));
    expect(onChange).toHaveBeenLastCalledWith({
      implants: [],
      boosters: [9950],
      boosterSideEffects: [2737],
    });

    rerender(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950], boosterSideEffects: [2737] }}
        onChange={onChange}
      />
    );
    expect(screen.getByRole('checkbox', { name: 'Shield capacity −20%' })).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Shield capacity −20%' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [9950] });
  });

  it('drops a removed booster’s side effects with it', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950], boosterSideEffects: [2737] }}
        onChange={onChange}
      />
    );
    await user.click(
      await screen.findByRole('button', { name: 'Remove Standard Blue Pill Booster' })
    );
    expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [] });
  });
});

describe('ImplantSetPicker — planning from the clone', () => {
  const fitting = { name: 'Drake', shipTypeId: 24698, modules: [] } as unknown as Fitting;
  const profile: PilotProfile = {
    skillLevels: new Map(),
    implantTypeIds: [10228, 13283],
    boosterTypeIds: [],
  };

  it('starts from the clone’s implants, and the first change saves them as the Fitting’s set', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={undefined}
        onChange={onChange}
        finder={{ fitting, profile, basis: 'clone' }}
        onUseClone={vi.fn()}
      />
    );
    expect(screen.getByText('Plan: 10228,13283')).toBeInTheDocument();
    expect(screen.getByText('Measured on: 10228,13283')).toBeInTheDocument();
    // Opening it alone saves nothing, and on the clone there is nothing to go back from.
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Use my clone' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Plan one more' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [10228, 13283, 999], boosters: [] });
  });

  it('keeps a Fitting’s own set, and drops it to go back to the clone', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onUseClone = vi.fn();
    const own = { implants: [5], boosters: [] };
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={own}
        onChange={onChange}
        finder={{ fitting: { ...fitting, implantSet: own }, profile, basis: 'fitting' }}
        onUseClone={onUseClone}
      />
    );
    expect(screen.getByText('Plan: 5')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Plan one more' }));
    expect(onChange).toHaveBeenLastCalledWith({ implants: [5, 999], boosters: [] });

    await user.click(screen.getByRole('button', { name: 'Use my clone' }));
    expect(onUseClone).toHaveBeenCalledTimes(1);
  });
});

describe('ImplantSetPicker — item info', () => {
  it('links an item’s name to Market and opens its details from the ⓘ button', async () => {
    const user = userEvent.setup();
    render(
      <ImplantSetPicker
        open
        onClose={vi.fn()}
        implantSet={{ implants: [], boosters: [9950] }}
        onChange={vi.fn()}
      />
    );

    const link = await screen.findByRole('link', { name: 'Standard Blue Pill Booster' });
    expect(link).toHaveAttribute('href', expect.stringContaining('/market/browser'));
    await user.click(
      screen.getByRole('button', { name: 'Show details of Standard Blue Pill Booster' })
    );
    expect(screen.getByText('Info: Standard Blue Pill Booster (9950)')).toBeInTheDocument();
  });
});

describe('ImplantSetPicker — one add box', () => {
  function renderEmpty(implantSet: FittingImplantSet = { implants: [], boosters: [] }) {
    const onChange = vi.fn();
    render(<ImplantSetPicker open onClose={vi.fn()} implantSet={implantSet} onChange={onChange} />);
    return onChange;
  }

  it('has a single search box for implants and boosters', () => {
    renderEmpty();
    expect(screen.getAllByRole('searchbox')).toHaveLength(1);
  });

  it('adds a booster to the boosters', async () => {
    const user = userEvent.setup();
    const onChange = renderEmpty();
    await user.type(screen.getByRole('searchbox'), 'Standard Blue Pill Booster{Enter}');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ implants: [], boosters: [9950] })
    );
  });

  it('adds an implant to the implants', async () => {
    const user = userEvent.setup();
    const onChange = renderEmpty();
    await user.type(screen.getByRole('searchbox'), 'Squire EG-602{Enter}');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ implants: [13283], boosters: [] })
    );
  });

  it('refuses an item that is neither', async () => {
    const user = userEvent.setup();
    const onChange = renderEmpty();
    await user.type(screen.getByRole('searchbox'), 'Damage Control II{Enter}');
    expect(await screen.findByText('Damage Control II isn’t an implant or booster.')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('replaces what already holds that slot', async () => {
    const user = userEvent.setup();
    const onChange = renderEmpty({ implants: [13283], boosters: [] });
    await user.type(screen.getByRole('searchbox'), 'Squire EG-603{Enter}');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ implants: [13284], boosters: [] })
    );
  });

  it('keeps both of two quick adds', async () => {
    const user = userEvent.setup();
    const onChange = renderEmpty();
    const box = screen.getByRole('searchbox');
    await user.type(box, 'Standard Blue Pill Booster{Enter}');
    await user.type(box, 'Squire EG-602{Enter}');
    await waitFor(() =>
      expect(onChange).toHaveBeenLastCalledWith({ implants: [13283], boosters: [9950] })
    );
  });
});
