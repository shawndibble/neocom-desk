import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { MovePlanModal } from './MovePlanModal';

const asset = (item_id: number, type_id: number, location_id: number, quantity = 1000) => ({
  item_id,
  type_id,
  quantity,
  location_id,
  location_type: 'station',
  location_flag: 'Hangar',
  is_singleton: false,
});

const JITA = 60003760;
const AMARR = 60008494;
const SYSTEM_JITA = 30000142;

vi.mock('@/features/character/assets', () => ({
  loadOtherCharactersAssets: () =>
    Promise.resolve([
      {
        characterId: 1,
        name: 'Alice',
        assets: [asset(1, 34, JITA), asset(2, 34, AMARR), asset(3, 35, AMARR, 5)],
      },
    ]),
}));
vi.mock('@/features/character/stations', () => ({
  loadStationName: (id: number) => Promise.resolve(id === 60003760 ? 'Jita 4-4' : 'Amarr VIII'),
  loadStationSystemId: (id: number) => Promise.resolve(id === 60003760 ? 30000142 : 30002187),
}));
vi.mock('@/features/character/structures', () => ({
  loadStructureName: () => Promise.resolve(null),
  loadStructureSystemId: () => Promise.resolve(null),
}));
vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: () =>
    Promise.resolve(
      new Map([
        [34, 'Tritanium'],
        [35, 'Pyerite'],
      ])
    ),
  loadTypePackagedVolumes: () => Promise.resolve(new Map([[34, 0.01]])),
}));
vi.mock('@/sde/loadSde', () => ({
  loadTypes: () => Promise.resolve({}),
  loadGroupCategories: () => Promise.resolve({}),
}));
vi.mock('@/features/fittings/useFittingCatalogue', () => ({ useFittingCatalogue: () => null }));
vi.mock('@/features/fittings/fittingPilotProfile', () => ({
  usePilotProfile: () => ({ profile: null, failed: false, retry: () => {} }),
}));
vi.mock('@/features/route/SolarSystemPicker', () => ({
  SolarSystemPicker: ({
    onChange,
    ariaLabel,
  }: {
    onChange: (id: number) => void;
    ariaLabel: string;
  }) => (
    <button type="button" onClick={() => onChange(30000142)}>
      {ariaLabel}
    </button>
  ),
}));

async function open() {
  const user = userEvent.setup();
  render(
    <MemoryRouter>
      <MovePlanModal open onClose={() => {}} characterIds={[1]} activeCharacterId={1} />
    </MemoryRouter>
  );
  await screen.findByText('Alice');
  return user;
}

describe('MovePlanModal', () => {
  it('plans a move from the picker to the destination system with a Route Safety link per pickup', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));

    expect(await screen.findByText('Edit items or destination')).toBeTruthy();
    const links = screen.getAllByRole('link', { name: 'Route Safety' });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain(String(SYSTEM_JITA));
    const heading = screen.getByRole('heading', { name: /Amarr VIII/ });
    expect(within(heading).getByRole('link', { name: 'Route Safety' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('says there is nothing to move when everything picked is already at the destination', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at jita 4-4/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));

    expect(await screen.findByText('Nothing to move')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose destination…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  it('folds a pickup group and keeps its picks, and selects a whole Character at once', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything for alice/i }));
    expect(screen.getByText('3 stacks picked')).toBeTruthy();

    const amarr = screen.getByRole('button', { name: /amarr viii/i });
    expect(amarr.getAttribute('aria-expanded')).toBe('true');
    await user.click(amarr);
    expect(amarr.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Pyerite')).toBeNull();
    expect(screen.getByText('3 stacks picked')).toBeTruthy();
  });

  it('keeps Show plan disabled until there is a destination and a pick', async () => {
    const user = await open();
    const show = screen.getByRole('button', { name: 'Show plan' });
    expect((show as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /select everything at jita 4-4/i }));
    expect((show as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    expect((show as HTMLButtonElement).disabled).toBe(false);
  });
});
