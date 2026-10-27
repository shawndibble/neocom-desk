import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { newFitting } from '@/engine/fittings/fittingEdit';
import type { Fitting, FittingModule } from '@/engine/fittings/types';
import { FittingMutationPanel } from './FittingMutationPanel';
import type { FittingCatalogue } from './useFittingCatalogue';
import type { FittingChange } from './useFittingWorkspace';

const ids = vi.hoisted(() => ({
  GRAVID: 47831,
  DECAYED: 47829,
  ABYSSAL: 47832,
  NEUT_II: 12271,
  GREMLIN: 16475,
  CAP: 6,
  POWER: 30,
}));
const { GRAVID, DECAYED, ABYSSAL, NEUT_II, GREMLIN, CAP, POWER } = ids;

vi.mock('@/features/abyssal/mutaplasmidData', async () => {
  const { mutaplasmidLookup } = await import('@/engine/fittings/mutaplasmids');
  const lookup = mutaplasmidLookup({
    attributeNames: { [ids.CAP]: 'capacitorNeed', [ids.POWER]: 'power' },
    mutaplasmids: {
      [ids.GRAVID]: {
        result: ids.ABYSSAL,
        bases: [ids.NEUT_II, ids.GREMLIN],
        attributes: [
          { id: ids.CAP, min: 0.8, max: 1.3, highIsGood: false },
          { id: ids.POWER, min: 0.85, max: 1.3, highIsGood: false },
        ],
      },
      [ids.DECAYED]: {
        result: ids.ABYSSAL,
        bases: [ids.GREMLIN],
        attributes: [{ id: ids.CAP, min: 0.85, max: 1.2, highIsGood: false }],
      },
    },
    abyssalTypeIds: [ids.ABYSSAL],
  });
  return { useMutaplasmidLookup: () => lookup };
});

const typeDetail = vi.hoisted(() => ({
  load: vi.fn(async (typeId: number) => ({
    description: '',
    dogma_effects: [],
    dogma_attributes:
      typeId === ids.NEUT_II || typeId === ids.GREMLIN
        ? [
            { attribute_id: ids.CAP, value: 100 },
            { attribute_id: ids.POWER, value: 1000 },
          ]
        : [],
  })),
}));
vi.mock('@/features/skills/typeDetail', () => ({ loadTypeDetail: typeDetail.load }));

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(async () => ({
    [ids.CAP]: { name: 'Activation Cost', unit: 'GJ', category: 'Fitting' },
    [ids.POWER]: { name: 'Powergrid Usage', unit: 'MW', category: 'Fitting' },
  })),
}));

const assets = vi.hoisted(() => ({
  loadCharacterAssets: vi.fn(),
  mutationsForItems: vi.fn(),
}));
vi.mock('@/features/assets/assets', () => ({
  loadCharacterAssets: assets.loadCharacterAssets,
}));
vi.mock('@/features/abyssal/dynamicItems', () => ({
  mutationsForItems: assets.mutationsForItems,
}));
const scope = vi.hoisted(() => ({ lacks: false }));
vi.mock('@/app/useGrantedScopes', () => ({
  useCharacterLacksEndpoints: () => scope.lacks,
}));

const NAMES: Record<number, string> = {
  [GRAVID]: 'Gravid Heavy Energy Neutralizer Mutaplasmid',
  [DECAYED]: 'Decayed Heavy Energy Neutralizer Mutaplasmid',
  [ABYSSAL]: 'Heavy Abyssal Energy Neutralizer',
  [NEUT_II]: 'Heavy Energy Neutralizer II',
  [GREMLIN]: 'Heavy Gremlin Compact Energy Neutralizer',
};
const catalogue = {
  types: Object.fromEntries(Object.entries(NAMES).map(([id, name]) => [id, { name }])),
} as unknown as FittingCatalogue;

function setup(module: FittingModule, characterId: number | null = null) {
  const edit = vi.fn<(change: FittingChange, coalesceKey?: string) => void>();
  const panel = (shown: FittingModule, character: number | null) => (
    <MemoryRouter>
      <FittingMutationPanel
        module={shown}
        catalogue={catalogue}
        edit={edit}
        characterId={character}
      />
    </MemoryRouter>
  );
  const { rerender } = render(panel(module, characterId));
  const fitting: Fitting = { ...newFitting(1, 'Test'), modules: [module] };
  /** The module as the `n`th edit leaves it. */
  const after = (n = 0) => edit.mock.calls[n]![0](fitting).modules[0]!;
  /** Shows the panel again, as the editor does after an edit or a Character switch. */
  const show = (shown: FittingModule, character = characterId) => rerender(panel(shown, character));
  return { edit, after, show };
}

const plain: FittingModule = { slot: 'high', slotIndex: 0, typeId: NEUT_II, state: 'active' };
const mutated: FittingModule = {
  ...plain,
  typeId: ABYSSAL,
  mutation: {
    baseTypeId: NEUT_II,
    mutaplasmidTypeId: GRAVID,
    attributes: { [CAP]: 80, [POWER]: 1000 },
  },
};

beforeEach(() => {
  scope.lacks = false;
  assets.loadCharacterAssets.mockReset();
  assets.mutationsForItems.mockReset();
});

describe('FittingMutationPanel', () => {
  it('applies a mutaplasmid to a plain module, its rolls starting at the base values', async () => {
    const user = userEvent.setup();
    const { edit, after } = setup(plain);
    const picker = await screen.findByRole('combobox', { name: 'Mutaplasmid' });
    await waitForEnabled(picker);
    await user.click(picker);
    expect(screen.getByText('Gravid')).toBeInTheDocument();
    await user.click(
      await screen.findByRole('option', { name: 'Gravid Heavy Energy Neutralizer Mutaplasmid' })
    );
    expect(edit).toHaveBeenCalledTimes(1);
    expect(after()).toMatchObject({
      typeId: ABYSSAL,
      mutation: {
        baseTypeId: NEUT_II,
        mutaplasmidTypeId: GRAVID,
        attributes: { [CAP]: 100, [POWER]: 1000 },
      },
    });
    // A plain module has no rolls, nothing to remove.
    expect(screen.queryByRole('slider')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove mutation' })).toBeNull();
  });

  it('rolls a mutated module on a worst-to-best slider showing the absolute value', async () => {
    const { edit, after } = setup(mutated);
    const cap = await screen.findByRole('slider', { name: 'Activation Cost' });
    // 80 GJ is the best activation cost Gravid rolls (lower is better).
    expect(cap).toHaveValue('100');
    expect(cap).toHaveAttribute('aria-valuetext', '80 GJ, 100% roll');
    expect(screen.getByText('Worst 130 GJ')).toBeInTheDocument();
    expect(screen.getByText('Best 80 GJ')).toBeInTheDocument();

    fireEvent.change(cap, { target: { value: '0' } });
    expect(edit).toHaveBeenCalledWith(expect.any(Function), 'mutation-high-0-6');
    expect(after().mutation!.attributes).toEqual({ [CAP]: 130, [POWER]: 1000 });
  });

  it('takes the mutation off, back to the base module, focus on the picker', async () => {
    const user = userEvent.setup();
    const { after, show } = setup(mutated);
    await user.click(await screen.findByRole('button', { name: 'Remove mutation' }));
    expect(after()).toEqual(plain);
    show(plain);
    expect(screen.getByRole('combobox', { name: 'Mutaplasmid' })).toHaveFocus();
  });

  it("says so when the base's values can't be read, and takes no mutaplasmid", async () => {
    typeDetail.load.mockResolvedValueOnce(null as never);
    setup(plain);
    expect(
      await screen.findByText("Couldn't read the base module's values", { exact: false })
    ).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Mutaplasmid' })).toBeDisabled();
  });

  it('says when the rolls are unknown, showing the base values', async () => {
    setup({ ...mutated, mutation: { ...mutated.mutation!, attributes: {} } });
    expect(await screen.findByText(/Rolls unknown/)).toBeInTheDocument();
    expect(await screen.findByRole('slider', { name: 'Activation Cost' })).toHaveAttribute(
      'aria-valuetext',
      '100 GJ, 60% roll'
    );
    expect(screen.getAllByText('base value')).toHaveLength(2);
  });

  it('lets the pilot name the mutaplasmid and base of an abyssal module of unknown base', async () => {
    const user = userEvent.setup();
    const { after } = setup({ ...plain, typeId: ABYSSAL });
    expect(screen.getByText(/Base module unknown/)).toBeInTheDocument();
    await user.click(screen.getByRole('combobox', { name: 'Mutaplasmid' }));
    await user.click(
      await screen.findByRole('option', { name: 'Decayed Heavy Energy Neutralizer Mutaplasmid' })
    );
    await user.click(screen.getByRole('combobox', { name: 'Base module' }));
    await user.click(
      await screen.findByRole('option', { name: 'Heavy Gremlin Compact Energy Neutralizer' })
    );
    expect(after()).toMatchObject({
      typeId: ABYSSAL,
      mutation: { baseTypeId: GREMLIN, mutaplasmidTypeId: DECAYED, attributes: {} },
    });
  });

  it("loads a real item's rolls from the pilot's assets", async () => {
    const user = userEvent.setup();
    const owned = {
      baseTypeId: GREMLIN,
      mutaplasmidTypeId: GRAVID,
      attributes: { [CAP]: 85, [POWER]: 900 },
    };
    assets.loadCharacterAssets.mockResolvedValue({
      cached: {
        truncated: false,
        data: [
          { type_id: ABYSSAL, item_id: 501, quantity: 1, location_flag: 'Hangar' },
          { type_id: 34, item_id: 502, quantity: 9, location_flag: 'Hangar' },
        ],
      },
      needsReauth: false,
    });
    assets.mutationsForItems.mockResolvedValue(new Map([[501, owned]]));
    const { after } = setup(plain, 90000001);

    await user.click(await screen.findByRole('button', { name: 'Load rolls from my assets' }));
    expect(assets.loadCharacterAssets).toHaveBeenCalledWith(90000001);
    expect(assets.mutationsForItems.mock.calls[0]![0]).toEqual([{ typeId: ABYSSAL, itemId: 501 }]);
    await user.click(
      await screen.findByRole('button', {
        name: /Heavy Gremlin Compact Energy Neutralizer · Gravid/,
      })
    );
    expect(after()).toMatchObject({ typeId: ABYSSAL, mutation: owned });
  });

  it("drops another Character's results", async () => {
    const user = userEvent.setup();
    assets.loadCharacterAssets.mockResolvedValue({
      cached: { data: [], truncated: false },
      needsReauth: false,
    });
    const { show } = setup(plain, 90000001);
    await user.click(await screen.findByRole('button', { name: 'Load rolls from my assets' }));
    expect(await screen.findByText('None of your assets is this module.')).toBeInTheDocument();
    show(plain, 90000002);
    expect(screen.queryByText('None of your assets is this module.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Load rolls from my assets' })).toBeInTheDocument();
  });

  it('hands focus to the picker once an owned item fills a module of unknown base', async () => {
    const user = userEvent.setup();
    const owned = {
      baseTypeId: GREMLIN,
      mutaplasmidTypeId: GRAVID,
      attributes: { [CAP]: 85, [POWER]: 900 },
    };
    assets.loadCharacterAssets.mockResolvedValue({
      cached: {
        truncated: false,
        data: [{ type_id: ABYSSAL, item_id: 501, quantity: 1, location_flag: 'Hangar' }],
      },
      needsReauth: false,
    });
    assets.mutationsForItems.mockResolvedValue(new Map([[501, owned]]));
    const unknownBase = { ...plain, typeId: ABYSSAL };
    const { after, show } = setup(unknownBase, 90000001);
    await user.click(await screen.findByRole('button', { name: 'Load rolls from my assets' }));
    await user.click(await screen.findByRole('button', { name: /· Gravid/ }));
    show(after());
    await vi.waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Mutaplasmid' })).toHaveFocus()
    );
  });

  it('says so when the assets hold none', async () => {
    const user = userEvent.setup();
    assets.loadCharacterAssets.mockResolvedValue({
      cached: { data: [], truncated: false },
      needsReauth: false,
    });
    setup(plain, 90000001);
    await user.click(await screen.findByRole('button', { name: 'Load rolls from my assets' }));
    expect(await screen.findByText('None of your assets is this module.')).toBeInTheDocument();
    expect(assets.mutationsForItems).not.toHaveBeenCalled();
  });
});

describe('FittingMutationPanel, assets it cannot read', () => {
  it('says the assets are unread, never "none", and offers a retry', async () => {
    const user = userEvent.setup();
    assets.loadCharacterAssets.mockResolvedValue({ cached: null, needsReauth: false });
    setup(plain, 90000001);
    await user.click(await screen.findByRole('button', { name: 'Load rolls from my assets' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("Couldn't read your assets");
    expect(screen.queryByText('None of your assets is this module.')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(assets.loadCharacterAssets).toHaveBeenCalledTimes(2);
  });

  it('asks for the Assets Permission instead, when the Character lacks it', async () => {
    scope.lacks = true;
    setup(plain, 90000001);
    expect(
      await screen.findByRole('link', { name: 'Grant missing Permissions' })
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load rolls from my assets' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Grant missing Permissions' })).toBeInTheDocument();
  });
});

/** The picker waits on the base's values before it takes a choice. */
async function waitForEnabled(element: HTMLElement) {
  await vi.waitFor(() => expect(element).toBeEnabled());
}
