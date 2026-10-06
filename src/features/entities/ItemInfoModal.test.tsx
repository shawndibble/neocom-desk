import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from 'vitest';
import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { ESI_BASE_URL } from '@/esi/client';
import type { BlueprintCatalog, BlueprintCatalogEntry } from '@/features/industry/blueprintCatalog';

vi.mock('@/sde/loadMarketSde', () => ({
  loadAttributeDictionary: vi.fn(async () => ({})),
  loadGlobalMarkets: vi.fn(async () => []),
}));
vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => ({ schematics: {}, raw: [] })),
  loadSkillAttributeModifiers: vi.fn(async () => ({})),
}));
vi.mock('@/features/industry/blueprintCatalog', async (importOriginal) => {
  const entries: BlueprintCatalogEntry[] = [
    {
      blueprintTypeID: 638,
      productTypeID: 587,
      productName: 'Rifter',
      productNameLower: 'rifter',
      blueprint: {
        name: 'Rifter Blueprint',
        time: 600,
        materials: [{ typeID: 34, quantity: 4500 }],
        products: [{ typeID: 587, quantity: 1 }],
        skills: [],
        activity: 'manufacturing',
      },
    },
  ];
  const catalog: BlueprintCatalog = {
    entries,
    byBlueprintTypeID: new Map(entries.map((e) => [e.blueprintTypeID, e])),
    byProductTypeID: new Map(entries.map((e) => [e.productTypeID!, e])),
    typesById: {},
  };
  return {
    ...(await importOriginal<typeof import('@/features/industry/blueprintCatalog')>()),
    loadBlueprintCatalog: vi.fn(async () => catalog),
  };
});
import { db } from '@/db';
import { useItemInfoModalStore } from '@/stores/itemInfoModal';
import { EntityInfoRoute } from './EntityInfoRoute';
import { ItemInfoLink } from './EntityLink';
import { ItemInfoModal } from './ItemInfoModal';

const server = setupServer(
  http.get(`${ESI_BASE_URL}/universe/types/:id`, ({ params }) =>
    HttpResponse.json({
      type_id: Number(params.id),
      name: params.id === '34' ? 'Tritanium' : 'Rifter',
      description: '',
      group_id: 18,
      published: true,
      volume: 0.01,
      dogma_attributes: [],
    })
  ),
  http.get(`${ESI_BASE_URL}/markets/:regionId/orders`, () => HttpResponse.json([]))
);
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(async () => {
  await db.esiCache.clear();
});
beforeEach(() => useItemInfoModalStore.setState({ request: null, staged: null }));

const probe: { navigate: ReturnType<typeof useNavigate>; search: string } = {
  navigate: () => Promise.resolve(),
  search: '',
};
function Probe() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    probe.navigate = navigate;
    probe.search = location.search;
  });
  return null;
}

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/assets']}>
      <EntityInfoRoute />
      <ItemInfoModal />
      <Probe />
      <ItemInfoLink typeId={34}>Tritanium</ItemInfoLink>
    </MemoryRouter>
  );
}

describe('ItemInfoModal with the real Item Detail', () => {
  it('lists Used in, and a drill-down keeps the modal open on the new item', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('link', { name: 'Tritanium' }));
    const dialog = await screen.findByRole('dialog');
    const rifter = await within(dialog).findByRole('link', { name: 'Rifter' });
    fireEvent.click(rifter);
    await waitFor(() => expect(probe.search).toBe('?info=type-587'));
    await screen.findByRole('heading', { name: 'Rifter' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Close closes in one press and Back in one pop', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('link', { name: 'Tritanium' }));
    await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.search).toBe('');

    fireEvent.click(screen.getByRole('link', { name: 'Tritanium' }));
    await screen.findByRole('dialog');
    act(() => void probe.navigate(-1));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(probe.search).toBe('');
  });
});
