import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import '@/i18n';
import { BpcContractModal } from './BpcContractModal';
import type { BpcContractRow } from '@/engine/contracts/bpcSearch';
import type { PublicContractItem } from '@/esi/endpoints';
import type { BlueprintMap } from '@/sde/types';

const BLUEPRINTS: BlueprintMap = {
  // Rifter Blueprint -> Rifter
  '638': {
    name: 'Rifter Blueprint',
    time: 1200,
    materials: [],
    products: [{ typeID: 587, quantity: 1 }],
    skills: [],
    activity: 'manufacturing',
  },
};

vi.mock('@/sde/loadSde', () => ({
  loadBlueprints: vi.fn(async (): Promise<BlueprintMap> => BLUEPRINTS),
}));

vi.mock('@/features/character/stations', () => ({
  loadStationName: vi.fn(async () => 'Jita IV - Moon 4'),
}));

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: vi.fn(
    async () =>
      new Map([
        [638, 'Rifter Blueprint'],
        [34, 'Tritanium'],
      ])
  ),
}));

const loadPublicContractItems = vi.fn();
vi.mock('@/features/bpcContracts/publicContractItems', () => ({
  loadPublicContractItems: (...args: unknown[]) => loadPublicContractItems(...args),
}));

const ROW: BpcContractRow = {
  contractId: 12345,
  regionId: 10000002,
  locationId: 60003760,
  typeId: 638,
  price: 5_000_000,
  isAuction: false,
  me: 10,
  te: 20,
  runs: 5,
  quantity: 1,
  dateExpired: Date.parse('2099-09-10T00:00:00Z'),
};

function items(list: PublicContractItem[]) {
  return { data: list, fetchedAt: new Date(), fromCache: false, truncated: false };
}

/** Reports where the router ended up, so a navigating menu action is assertable. */
function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function renderModal() {
  return render(
    <MemoryRouter initialEntries={['/industry?tab=sourcing']}>
      <BpcContractModal
        row={ROW}
        blueprintName="Rifter Blueprint"
        regionName="The Forge"
        onClose={() => {}}
      />
      <LocationProbe />
    </MemoryRouter>
  );
}

beforeEach(() => {
  loadPublicContractItems.mockReset();
  loadPublicContractItems.mockResolvedValue(
    items([
      {
        record_id: 1,
        type_id: 638,
        quantity: 1,
        is_included: true,
        is_blueprint_copy: true,
        material_efficiency: 10,
        time_efficiency: 20,
        runs: 5,
      },
      { record_id: 2, type_id: 34, quantity: 744, is_included: true },
    ])
  );
});

describe('BpcContractModal — Build Plan context menu', () => {
  it('right-clicking a blueprint line starts a Build Plan seeded at that line’s ME/TE/runs', async () => {
    renderModal();

    // Scoped to the contents list: the modal's own title is the blueprint name too.
    const contents = await screen.findByRole('list');
    fireEvent.contextMenu(within(contents).getByText('Rifter Blueprint'));

    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    // 587 (Rifter), not 638 (the blueprint in the contract) — and this
    // line's own 10/20 x5, not the generic defaults (issue #638).
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/industry?product=587&me=10&te=20&runs=5'
    );
  });

  it('seeds the same line identically on a second click, the key Industry’s reuse rule matches on', async () => {
    renderModal();
    const contents = await screen.findByRole('list');
    const line = within(contents).getByText('Rifter Blueprint');

    for (let i = 0; i < 2; i++) {
      fireEvent.contextMenu(line);
      fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));
      expect(screen.getByTestId('location')).toHaveTextContent(
        '/industry?product=587&me=10&te=20&runs=5'
      );
    }
  });

  it('falls back to the unseeded menu when ESI omits one of the copy’s numbers', async () => {
    loadPublicContractItems.mockResolvedValue(
      items([
        {
          record_id: 1,
          type_id: 638,
          quantity: 1,
          is_included: true,
          is_blueprint_copy: true,
          material_efficiency: 10,
          time_efficiency: 20,
          // runs omitted — a worse answer would seed a 0-run plan.
        },
      ])
    );
    renderModal();

    const contents = await screen.findByRole('list');
    fireEvent.contextMenu(within(contents).getByText('Rifter Blueprint'));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));

    expect(screen.getByTestId('location')).toHaveTextContent('/industry?product=587');
    expect(screen.getByTestId('location')).not.toHaveTextContent('me=');
  });

  it('seeds two bundled copies at different research to different plans', async () => {
    loadPublicContractItems.mockResolvedValue(
      items([
        {
          record_id: 1,
          type_id: 638,
          quantity: 1,
          is_included: true,
          is_blueprint_copy: true,
          material_efficiency: 10,
          time_efficiency: 20,
          runs: 5,
        },
        {
          record_id: 2,
          type_id: 638,
          quantity: 1,
          is_included: true,
          is_blueprint_copy: true,
          material_efficiency: 2,
          time_efficiency: 4,
          runs: 1,
        },
      ])
    );
    renderModal();

    const contents = await screen.findByRole('list');
    const rows = within(contents).getAllByText('Rifter Blueprint');
    expect(rows).toHaveLength(2);

    fireEvent.contextMenu(rows[0]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/industry?product=587&me=10&te=20&runs=5'
    );

    fireEvent.contextMenu(rows[1]);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Build Plan' }));
    expect(screen.getByTestId('location')).toHaveTextContent(
      '/industry?product=587&me=2&te=4&runs=1'
    );
  });

  it('disables the action on a bundled item nothing builds', async () => {
    renderModal();

    fireEvent.contextMenu(await screen.findByText('Tritanium'));

    const item = await screen.findByRole('menuitem', { name: 'No blueprint options' });
    expect(item).toHaveAttribute('data-disabled');
  });

  it('explains the right-click on the contents heading', async () => {
    renderModal();

    expect(
      await screen.findByRole('button', { name: 'About Everything on this contract' })
    ).toBeInTheDocument();
  });
});
