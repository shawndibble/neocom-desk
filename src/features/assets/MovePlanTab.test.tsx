import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import '@/i18n';
import { planMove } from '@/engine/assets/movePlan';
import { MovePlanTab } from './MovePlanTab';

vi.mock('@/engine/assets/movePlan', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/assets/movePlan')>();
  return { ...actual, planMove: vi.fn(actual.planMove) };
});

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

const skippedCharacters = vi.hoisted(() => ({
  list: [] as { characterId: number; name: string }[],
  noEntries: false,
}));
vi.mock('@/features/assets/assets', () => ({
  loadOtherCharactersAssetsDetailed: () =>
    Promise.resolve({
      entries: skippedCharacters.noEntries
        ? []
        : [
            {
              characterId: 1,
              name: 'Alice',
              assets: [asset(1, 34, JITA), asset(2, 34, AMARR), asset(3, 35, AMARR, 5)],
            },
          ],
      skipped: skippedCharacters.list,
    }),
}));
const failing = vi.hoisted(() => ({ name: false, system: false }));
vi.mock('@/features/character/stations', () => ({
  loadStationName: (id: number) =>
    failing.name
      ? Promise.reject(new Error('name down'))
      : Promise.resolve(id === 60003760 ? 'Jita 4-4' : 'Amarr VIII'),
  loadStationSystemId: (id: number) =>
    failing.system
      ? Promise.reject(new Error('system down'))
      : Promise.resolve(id === 60003760 ? 30000142 : 30002187),
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
const hullData = vi.hoisted(() => ({ catalogueFailed: false, skillsKnown: true }));
vi.mock('@/features/fittings/useFittingCatalogue', () => ({
  useFittingCatalogue: () => null,
  useFittingCatalogueFailed: () => hullData.catalogueFailed,
}));
vi.mock('@/features/fittings/fittingPilotProfile', () => ({
  usePilotProfile: () => ({
    profile: null,
    failed: false,
    skillsKnown: hullData.skillsKnown,
    retry: () => {},
  }),
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
      <MovePlanTab onClose={() => {}} characterIds={[1]} activeCharacterId={1} />
    </MemoryRouter>
  );
  await screen.findByText('Alice');
  return user;
}

describe('MovePlanTab', () => {
  beforeEach(() => {
    failing.name = false;
    failing.system = false;
    hullData.catalogueFailed = false;
    hullData.skillsKnown = true;
    skippedCharacters.list = [];
    skippedCharacters.noEntries = false;
  });

  it('names the Characters whose assets did not load instead of dropping them silently', async () => {
    skippedCharacters.list = [{ characterId: 2, name: 'Bob' }];
    await open();
    expect(
      screen.getAllByText("Couldn't load assets for Bob — they are missing here.")
    ).not.toHaveLength(0);
  });

  it("does not say there is nothing to move when no Character's assets loaded", async () => {
    skippedCharacters.list = [{ characterId: 1, name: 'Alice' }];
    skippedCharacters.noEntries = true;
    render(
      <MemoryRouter>
        <MovePlanTab onClose={() => {}} characterIds={[1]} activeCharacterId={1} />
      </MemoryRouter>
    );
    expect(await screen.findByText(/assets aren't saved on this device yet/)).toBeInTheDocument();
    expect(screen.queryByText('No loose stock or ships to move.')).not.toBeInTheDocument();
  });

  it('keeps the pickup system and its Route Safety link when the name read fails', async () => {
    failing.name = true;
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at 60008494/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: /^Route Safety/ })).toHaveLength(1);
  });

  async function planAmarr() {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));
  }

  it('blames the missing hauler data, not the pilot, when the catalogue could not be loaded', async () => {
    hullData.catalogueFailed = true;
    await planAmarr();
    expect(
      await screen.findByText(/Hauler sizing needs data that isn't downloaded yet/)
    ).toBeTruthy();
    expect(screen.queryByText('No hauler you can fly could be sized for this load.')).toBeNull();
  });

  it('blames the missing data too when the pilot skills could not be read', async () => {
    hullData.skillsKnown = false;
    await planAmarr();
    expect(
      await screen.findByText(/Hauler sizing needs data that isn't downloaded yet/)
    ).toBeTruthy();
  });

  it('says the data is still loading, not "connect once", while the catalogue is merely loading', async () => {
    await planAmarr();
    expect(await screen.findByText(/Hauler data is still loading/)).toBeTruthy();
    expect(screen.queryByText(/Connect once/)).toBeNull();
  });

  it('keeps the pickup name when the system read fails', async () => {
    failing.system = true;
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /Amarr VIII/ })).toBeTruthy();
  });

  it('plans a move from the picker to the destination system with a Route Safety link per pickup', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.queryByText('Edit items or destination')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
    const links = screen.getAllByRole('link', { name: /^Route Safety/ });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toContain(String(SYSTEM_JITA));
    expect(screen.getByRole('heading', { name: /Amarr VIII/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Route Safety from Amarr VIII' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy();
  });

  it('marks stacks at the destination, unticks them and keeps them out of the plan', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at jita 4-4/i }));
    expect(screen.getByText('1 stack · 10 m³')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    const jita = screen.getByRole('checkbox', { name: /select everything at jita 4-4/i });
    expect((jita as HTMLInputElement).disabled).toBe(true);
    expect((jita as HTMLInputElement).checked).toBe(false);
    expect(screen.getAllByText('At destination').length).toBeGreaterThan(0);
    expect(screen.getByText('Nothing picked yet')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Show plan' }) as HTMLButtonElement).disabled).toBe(
      true
    );
  });

  it('takes one of your stations as the destination from the chips', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at jita 4-4/i }));
    const group = screen.getByRole('group', { name: 'Or one of your stations' });
    const amarr = within(group).getByRole('button', { name: 'Amarr VIII' });
    await user.click(amarr);
    expect(amarr.getAttribute('aria-pressed')).toBe('true');
    await user.click(screen.getByRole('button', { name: 'Show plan' }));

    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
    expect(screen.getByText('Deliver everything here')).toBeTruthy();
  });

  it('folds a pickup group and keeps its picks, and selects a whole Character at once', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything for alice/i }));
    expect(screen.getByText(/^3 stacks · /)).toBeTruthy();

    const amarr = screen.getByRole('button', { name: 'Alice, Amarr VIII, 2 of 2 stacks' });
    expect(amarr.getAttribute('aria-controls')).toBeTruthy();
    expect(amarr.getAttribute('aria-expanded')).toBe('true');
    await user.click(amarr);
    expect(amarr.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('Pyerite')).toBeNull();
    expect(screen.getByText(/^3 stacks · /)).toBeTruthy();
  });

  it('keeps Show plan disabled until there is a destination and a pick away from it', async () => {
    const user = await open();
    const show = screen.getByRole('button', { name: 'Show plan' });
    expect((show as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /select everything at jita 4-4/i }));
    expect((show as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    expect((show as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    expect((show as HTMLButtonElement).disabled).toBe(false);
  });

  it('puts focus on the plan heading after Show plan, and back on Deliver to after Back', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    await user.click(screen.getByRole('button', { name: 'Show plan' }));
    const plan = await screen.findByRole('heading', { name: 'Plan a move' });
    await waitFor(() => expect(document.activeElement).toBe(plan));

    await user.click(screen.getByRole('button', { name: 'Back' }));
    const deliver = await screen.findByRole('heading', { name: 'Deliver to' });
    await waitFor(() => expect(document.activeElement).toBe(deliver));
  });

  it('announces a plan that could not be worked out', async () => {
    const user = await open();
    await user.click(screen.getByRole('checkbox', { name: /select everything at amarr viii/i }));
    await user.click(screen.getByRole('button', { name: 'Pick a system' }));
    vi.mocked(planMove).mockImplementationOnce(() => {
      throw new Error('boom');
    });
    const status = screen.getAllByRole('status').find((el) => el.className.includes('sr-only'));
    expect(status).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Show plan' }));
    await waitFor(() => expect(status!.textContent).toMatch(/could not work out the plan/i));
  });

  it('keeps focused rows clear of the sticky bars', async () => {
    await open();
    const scroller = screen.getByRole('region', { name: 'Plan a move' });
    expect(scroller.className).toContain('scroll-pb-');
    expect(scroller.className).toContain('max-sm:scroll-pt-');
  });
});
