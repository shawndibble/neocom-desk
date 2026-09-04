import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type {
  CharacterPlanet,
  CharacterPlanetDetail,
  PlanetPin,
  PlanetType,
} from '@/esi/endpoints';
import type { PiData } from '@/sde/types';

const pi = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

const DAY_MS = 86_400_000;
const INSTALL = Date.parse('2026-09-01T00:00:00Z');

const ASHAB = 30_002_187;
/** Temperate Extractor Control Unit, Temperate Basic Industry Facility, Temperate Launchpad. */
const ECU = 3068;
const BASIC = 2481;
const LAUNCHPAD = 2256;
/** Reactive Metals — a P1 the Basic Industry Facility runs. */
const REACTIVE_METALS_SCHEMATIC = 133;
/** Base Metals, the P0 it eats. */
const BASE_METALS = 2267;

const loadCharacterPlanets = vi.fn();
const loadAllColonyDetails = vi.fn();
const loadCommandCenterUpgrades = vi.fn();
const loadSystemPlanetIds = vi.fn();
const loadSystemName = vi.fn();
const loadPlanetInfo = vi.fn();
const loadSchematicName = vi.fn();
const loadTypeNames = vi.fn();

vi.mock('@/sde/loadSde', () => ({ loadPi: vi.fn(async () => pi) }));

vi.mock('./data', () => ({
  loadCharacterPlanets: (...args: unknown[]) => loadCharacterPlanets(...args),
  loadAllColonyDetails: (...args: unknown[]) => loadAllColonyDetails(...args),
}));

vi.mock('./colonyBudget', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./colonyBudget')>()),
  loadCommandCenterUpgrades: (...args: unknown[]) => loadCommandCenterUpgrades(...args),
}));

vi.mock('@/features/character/systemSecurity', () => ({
  loadSystemPlanetIds: (...args: unknown[]) => loadSystemPlanetIds(...args),
  loadSystemName: (...args: unknown[]) => loadSystemName(...args),
}));

vi.mock('./names', () => ({
  loadPlanetInfo: (...args: unknown[]) => loadPlanetInfo(...args),
  loadSchematicName: (...args: unknown[]) => loadSchematicName(...args),
}));

vi.mock('@/features/character/typeNames', () => ({
  loadTypeNames: (...args: unknown[]) => loadTypeNames(...args),
}));

const { AdvisorPanel } = await import('./AdvisorPanel');

function colony(planetId: number, planetType: PlanetType): CharacterPlanet {
  return {
    solar_system_id: ASHAB,
    planet_id: planetId,
    planet_type: planetType,
    owner_id: 1,
    last_update: '2026-09-03T00:00:00Z',
    upgrade_level: 4,
    num_pins: 3,
  };
}

/** CCP's own worked baseline: 6,965 a cycle on 30-minute cycles for 14 days. */
function extractorPin(pinId: number): PlanetPin {
  return {
    pin_id: pinId,
    type_id: ECU,
    latitude: 0,
    longitude: 0,
    install_time: new Date(INSTALL).toISOString(),
    expiry_time: new Date(INSTALL + 14 * DAY_MS).toISOString(),
    extractor_details: {
      heads: [1, 2, 3, 4].map((id) => ({ head_id: id, latitude: 0, longitude: 0 })),
      cycle_time: 1_800,
      qty_per_cycle: 6_965,
      product_type_id: BASE_METALS,
    },
  };
}

const detail: CharacterPlanetDetail = {
  links: [],
  routes: [],
  pins: [
    extractorPin(1),
    {
      pin_id: 2,
      type_id: BASIC,
      latitude: 0,
      longitude: 0,
      factory_details: { schematic_id: REACTIVE_METALS_SCHEMATIC },
    },
    { pin_id: 3, type_id: LAUNCHPAD, latitude: 0, longitude: 0 },
  ],
};

/** Ashab III is the colony; Ashab II is a Barren planet with nothing on it. */
const PLANET_INFO: Record<number, { name: string; typeId: number }> = {
  40_000_001: { name: 'Ashab III', typeId: 11 },
  40_000_002: { name: 'Ashab II', typeId: 2016 },
};

function renderPanel(onSystemIdChange = vi.fn()) {
  return render(
    <AdvisorPanel characterId={1} systemId={null} onSystemIdChange={onSystemIdChange} />
  );
}

beforeEach(() => {
  for (const mock of [
    loadCharacterPlanets,
    loadAllColonyDetails,
    loadCommandCenterUpgrades,
    loadSystemPlanetIds,
    loadSystemName,
    loadPlanetInfo,
    loadSchematicName,
    loadTypeNames,
  ]) {
    mock.mockReset();
  }
  loadCharacterPlanets.mockResolvedValue({
    cached: { data: [colony(40_000_001, 'temperate')], fetchedAt: new Date(), fromCache: false },
    needsReauth: false,
  });
  loadAllColonyDetails.mockResolvedValue(
    new Map([[40_000_001, { cached: { data: detail, fetchedAt: new Date(), fromCache: false } }]])
  );
  loadCommandCenterUpgrades.mockResolvedValue(4);
  loadSystemPlanetIds.mockResolvedValue([40_000_001, 40_000_002]);
  loadSystemName.mockResolvedValue('Ashab');
  loadPlanetInfo.mockImplementation(async (planetId: number) => PLANET_INFO[planetId] ?? null);
  loadSchematicName.mockResolvedValue('Reactive Metals');
  loadTypeNames.mockResolvedValue(new Map([[BASE_METALS, 'Base Metals']]));
});

describe('AdvisorPanel', () => {
  it('states the budget it sized against, and that it came from a trained level', async () => {
    renderPanel();
    expect(await screen.findByText('4 — 21,315 tf / 17,000 MW per planet')).toBeInTheDocument();
    expect(screen.queryByText(/assumed/)).not.toBeInTheDocument();
  });

  it('flags an assumed budget when the character has no skill data', async () => {
    loadCommandCenterUpgrades.mockResolvedValue(null);
    renderPanel();
    expect(
      await screen.findByText('0 — 1,675 tf / 6,000 MW per planet (assumed)')
    ).toBeInTheDocument();
  });

  it('shows the built colony’s measured extraction rate, not its qty_per_cycle', async () => {
    renderPanel();
    const card = (await screen.findByText('Ashab III')).closest('div')?.parentElement;
    expect(card).not.toBeNull();
    // 1,874,985 units over 336 hours from the decay curve, so 5,580/hr.
    // qty_per_cycle alone would claim 13,930.
    expect(within(card as HTMLElement).getByText('5,580/hr')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('Base Metals')).toBeInTheDocument();
    expect(within(card as HTMLElement).getByText('Reactive Metals')).toBeInTheDocument();
  });

  it('reports the colony’s CPU and Powergrid against the budget', async () => {
    renderPanel();
    // One ECU (400 tf / 2,600 MW) with 4 heads (110/550 each), one basic
    // factory (200/800) and one launchpad (3,600/700).
    expect(await screen.findByText('4,640 / 21,315 tf')).toBeInTheDocument();
    expect(screen.getByText('6,300 / 17,000 MW')).toBeInTheDocument();
  });

  it('says what the leftover budget still holds', async () => {
    renderPanel();
    // 16,675 tf and 10,700 MW left. Powergrid binds: 13 basic (800 MW), 15
    // advanced or storage (700), and only 1 extractor once ten heads are
    // costed in (2,600 + 5,500 MW).
    const room = await screen.findByText(/1x extractor/);
    expect(room).toHaveTextContent('13x basic factory');
    expect(room).toHaveTextContent('15x advanced factory');
  });

  it('names an unbuilt planet’s resources and refuses to price them', async () => {
    renderPanel();
    const heading = await screen.findByText('Ashab II');
    const card = heading.closest('div')?.parentElement as HTMLElement;
    expect(within(card).getByText('Could extract')).toBeInTheDocument();
    expect(within(card).getByText(/Base Metals/)).toBeInTheDocument();
    expect(within(card).getByText(/No ISK figure here/)).toBeInTheDocument();
  });

  it('counts only the planets a colony could go on', async () => {
    renderPanel();
    expect(await screen.findByText('1 / 2 planets')).toBeInTheDocument();
  });

  it('marks a shattered planet as taking no colony rather than as unbuilt', async () => {
    loadSystemPlanetIds.mockResolvedValue([40_000_001, 40_000_009]);
    loadPlanetInfo.mockImplementation(async (planetId: number) =>
      planetId === 40_000_009
        ? { name: 'Ashab X', typeId: 30_889 }
        : (PLANET_INFO[planetId] ?? null)
    );
    renderPanel();
    expect(await screen.findByText('Ashab X')).toBeInTheDocument();
    expect(screen.getByText('No colony can be placed on this planet.')).toBeInTheDocument();
    // And it is not counted as somewhere a colony could still go.
    expect(screen.getByText('1 / 1 planets')).toBeInTheDocument();
  });

  it('prompts a character with no colonies towards the Plan tab instead of an empty grid', async () => {
    loadCharacterPlanets.mockResolvedValue({
      cached: { data: [], fetchedAt: new Date(), fromCache: false },
      needsReauth: false,
    });
    loadAllColonyDetails.mockResolvedValue(new Map());
    renderPanel();
    expect(await screen.findByText('No colonies yet')).toBeInTheDocument();
  });

  it('puts the chosen system in the URL rather than in its own state', async () => {
    const onSystemIdChange = vi.fn();
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [
          colony(40_000_001, 'temperate'),
          { ...colony(40_000_050, 'barren'), solar_system_id: 30_000_002 },
        ],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    loadSystemName.mockImplementation(async (systemId: number) =>
      systemId === ASHAB ? 'Ashab' : 'Amarr'
    );
    renderPanel(onSystemIdChange);

    const select = await screen.findByLabelText('System');
    await userEvent.selectOptions(select, '30000002');
    expect(onSystemIdChange).toHaveBeenCalledWith(30_000_002);
  });
});
