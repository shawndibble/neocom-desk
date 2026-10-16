import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import type { MutaplasmidData } from '@/sde/types';
import type { DynamicItemRecord } from '@/db';
import { AbyssalItemDetail } from './AbyssalItemDetail';
import { resetMutaplasmidLookupForTests } from './mutaplasmidData';
import { loadTypeNames } from '@/features/character/typeNames';
import { loadTypeDetail } from '@/features/skills/typeDetail';

const GRAVID = 47831;
const DECAYED = 47829;
const ABYSSAL_NEUT = 47832;
const GREMLIN = 16475;
const NEUT_II = 12271;

const DATA: MutaplasmidData = {
  attributeNames: { 6: 'capacitorNeed', 73: 'duration' },
  mutaplasmids: {
    [GRAVID]: {
      result: ABYSSAL_NEUT,
      bases: [NEUT_II, GREMLIN],
      attributes: [
        { id: 6, min: 0.8, max: 1.3, highIsGood: false },
        { id: 73, min: 0.9, max: 1.2, highIsGood: false },
      ],
    },
    [DECAYED]: {
      result: ABYSSAL_NEUT,
      bases: [GREMLIN],
      attributes: [{ id: 6, min: 0.85, max: 1.2, highIsGood: false }],
    },
  },
  abyssalTypeIds: [ABYSSAL_NEUT],
};

const NAMES: Record<number, string> = {
  [GRAVID]: 'Gravid Heavy Energy Neutralizer Mutaplasmid',
  [DECAYED]: 'Decayed Heavy Energy Neutralizer Mutaplasmid',
  [ABYSSAL_NEUT]: 'Heavy Abyssal Energy Neutralizer',
  [GREMLIN]: 'Heavy Gremlin Compact Energy Neutralizer',
  [NEUT_II]: 'Heavy Energy Neutralizer II',
};

const BASE_ATTRIBUTES: Record<number, [number, number][]> = {
  [NEUT_II]: [
    [6, 100],
    [73, 12000],
  ],
  [GREMLIN]: [
    [6, 200],
    [73, 10000],
  ],
};

vi.mock('@/sde/loadSde', () => ({ loadMutaplasmids: vi.fn(async () => DATA) }));
vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(async () => ({
    6: { name: 'Activation Cost', unit: 'GJ', category: 'Capacitor', unitId: 114 },
    73: { name: 'Activation time / duration', unit: 's', category: 'Misc', unitId: 101 },
  })),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async (ids: readonly number[]) => new Map(ids.map((id) => [id, NAMES[id] ?? `Type #${id}`]))
  ),
}));
vi.mock('@/features/skills/typeDetail', () => ({
  loadTypeDetail: vi.fn(async (typeId: number) => ({
    dogma_attributes: (BASE_ATTRIBUTES[typeId] ?? []).map(([attribute_id, value]) => ({
      attribute_id,
      value,
    })),
  })),
}));

afterEach(() => resetMutaplasmidLookupForTests());

function renderDetail(typeId: number, dynamic: Parameters<typeof AbyssalItemDetail>[0]['dynamic']) {
  return render(
    <MemoryRouter>
      <AbyssalItemDetail typeId={typeId} dynamic={dynamic} />
    </MemoryRouter>
  );
}

describe('AbyssalItemDetail', () => {
  it('renders nothing for an ordinary type', async () => {
    const { container } = renderDetail(587, { status: 'none' });
    // Let the lookup and dictionary load.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container).toBeEmptyDOMElement();
  });

  it('lists bases and mutaplasmids, and each strain’s absolute range on the Tech II base', async () => {
    renderDetail(ABYSSAL_NEUT, { status: 'none' });
    const table = await screen.findByRole('table', { name: /Heavy Energy Neutralizer II/ });
    expect(screen.getByRole('link', { name: NAMES[GREMLIN] })).toHaveAttribute(
      'href',
      `/?info=type-${GREMLIN}`
    );
    expect(screen.getByRole('link', { name: NAMES[DECAYED] })).toBeInTheDocument();
    // Only Gravid applies to the T2 base; its label drops the words every name shares.
    expect(within(table).getByRole('columnheader', { name: 'Gravid' })).toBeInTheDocument();
    expect(within(table).queryByRole('columnheader', { name: 'Decayed' })).toBeNull();
    const cap = within(table).getByRole('row', { name: /Activation Cost/ });
    expect(within(cap).getByText('80 – 130')).toBeInTheDocument();
    expect(within(cap).getByText('Lower is better')).toBeInTheDocument();
    // Duration is stored in ms and shown in seconds.
    const duration = within(table).getByRole('row', { name: /duration/ });
    expect(within(duration).getByText('10.8 – 14.4')).toBeInTheDocument();
  });

  it('switches the ranges to another base', async () => {
    renderDetail(ABYSSAL_NEUT, { status: 'none' });
    await screen.findByRole('table');
    await userEvent.setup().selectOptions(screen.getByLabelText('Base module'), String(GREMLIN));
    const table = await screen.findByRole('table', { name: /Gremlin/ });
    expect(within(table).getByRole('columnheader', { name: 'Decayed' })).toBeInTheDocument();
    const cap = within(table).getByRole('row', { name: /Activation Cost/ });
    expect(within(cap).getByText('170 – 240')).toBeInTheDocument();
    expect(within(cap).getByText('160 – 260')).toBeInTheDocument();
  });

  it('shows an owned module’s rolls against its base, with roll quality', async () => {
    const record: DynamicItemRecord = {
      itemId: 1,
      typeId: ABYSSAL_NEUT,
      createdBy: 9,
      sourceTypeId: GREMLIN,
      mutatorTypeId: DECAYED,
      attributes: [
        [6, 170],
        [9, 500],
      ],
      savedAt: 0,
    };
    renderDetail(ABYSSAL_NEUT, { status: 'ready', record });
    expect(await screen.findByRole('link', { name: NAMES[GREMLIN] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: NAMES[DECAYED] })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: "This module's rolls" });
    const cap = within(table).getByRole('row', { name: /Activation Cost/ });
    expect(within(cap).getByText('200')).toBeInTheDocument();
    expect(within(cap).getByText('170')).toBeInTheDocument();
    expect(within(cap).getByText('100%')).toBeInTheDocument();
  });

  it('still picks a base and shows the ranges when type names fail to load', async () => {
    vi.mocked(loadTypeNames).mockRejectedValueOnce(new Error('offline'));
    renderDetail(ABYSSAL_NEUT, { status: 'none' });
    const table = await screen.findByRole('table', { name: new RegExp(`Type #${NEUT_II}`) });
    expect(within(table).getByRole('row', { name: /Activation Cost/ })).toBeInTheDocument();
  });

  it('says so when an owned module has no rolls to show against its base', async () => {
    vi.mocked(loadTypeDetail).mockResolvedValueOnce(null);
    const record: DynamicItemRecord = {
      itemId: 1,
      typeId: ABYSSAL_NEUT,
      createdBy: 9,
      sourceTypeId: GREMLIN,
      mutatorTypeId: DECAYED,
      attributes: [[6, 170]],
      savedAt: 0,
    };
    renderDetail(ABYSSAL_NEUT, { status: 'ready', record });
    expect(await screen.findByText('No rolls to show for this module.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('falls back to the type’s ranges when the owned module’s rolls can’t be read', async () => {
    renderDetail(ABYSSAL_NEUT, { status: 'failed' });
    expect(await screen.findByText(/Couldn't read this module's own rolls/)).toBeInTheDocument();
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });

  it('shows what a mutaplasmid applies to, what it makes and its rolls as ±%', async () => {
    renderDetail(GRAVID, { status: 'none' });
    expect(await screen.findByRole('link', { name: NAMES[ABYSSAL_NEUT] })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: NAMES[NEUT_II] })).toBeInTheDocument();
    expect(screen.getByText('-20% to +30%')).toBeInTheDocument();
    expect(screen.getByText('-10% to +20%')).toBeInTheDocument();
  });
});
