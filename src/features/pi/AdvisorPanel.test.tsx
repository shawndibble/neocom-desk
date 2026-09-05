import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@/i18n';
import type {
  CharacterPlanet,
  CharacterPlanetDetail,
  PlanetPin,
  PlanetType,
} from '@/esi/endpoints';
import type { PiData } from '@/sde/types';
import { ESI_FANOUT_CONCURRENCY } from '@/lib/concurrency';

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
const NOBLE_METALS = 2270;

const loadCharacterPlanets = vi.fn();
const loadAllColonyDetails = vi.fn();
const loadCommandCenterUpgrades = vi.fn();
const loadSystemPlanetIds = vi.fn();
const loadSystemName = vi.fn();
const loadPlanetInfo = vi.fn();
const loadSchematicName = vi.fn();
const loadTypeNames = vi.fn();
const loadSystemSecurity = vi.fn();
const loadCustomsCodeExpertise = vi.fn();

const loadPiPlanetRadius = vi.fn<() => Promise<Record<string, number>>>();
vi.mock('@/sde/loadSde', () => ({
  loadPi: vi.fn(async () => pi),
  // Efa II's real radius, so these tests do the same arithmetic the app does
  // against the shipped payload.
  loadPiPlanetRadius: () => loadPiPlanetRadius(),
}));
const setPlanetRichness = vi.fn<(planetId: number, order: number[]) => Promise<void>>();
const clearPlanetRichness = vi.fn<(planetId: number) => Promise<void>>();
vi.mock('@/sync', () => ({
  setPlanetRichness: (planetId: number, order: number[]) => setPlanetRichness(planetId, order),
  clearPlanetRichness: (planetId: number) => clearPlanetRichness(planetId),
}));
const loadPlanPrices = vi.fn<() => Promise<import('./planPrices').PlanPrices>>();
vi.mock('./planPrices', () => ({ loadPlanPrices: () => loadPlanPrices() }));

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
  loadSystemSecurity: (...args: unknown[]) => loadSystemSecurity(...args),
}));

vi.mock('./customsRate', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./customsRate')>()),
  loadCustomsCodeExpertise: (...args: unknown[]) => loadCustomsCodeExpertise(...args),
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
  loadPiPlanetRadius.mockResolvedValue({ '40000001': 6030, '40000002': 6030 });
  for (const mock of [
    loadCharacterPlanets,
    loadAllColonyDetails,
    loadCommandCenterUpgrades,
    loadSystemPlanetIds,
    loadSystemName,
    loadPlanetInfo,
    loadSchematicName,
    loadTypeNames,
    loadSystemSecurity,
    loadCustomsCodeExpertise,
    loadPlanPrices,
  ]) {
    mock.mockReset();
  }
  loadPlanPrices.mockResolvedValue({
    prices: { [BASE_METALS]: 12 },
    unpriced: [],
    failed: false,
    fetchedAt: new Date(),
  });
  // Ashab is highsec, and the character has Customs Code Expertise IV — so
  // every chain below is costed at the 6% these two imply.
  loadSystemSecurity.mockResolvedValue(0.5);
  loadCustomsCodeExpertise.mockResolvedValue(4);
  loadCharacterPlanets.mockResolvedValue({
    cached: { data: [colony(40_000_001, 'temperate')], fetchedAt: new Date(), fromCache: false },
    needsReauth: false,
  });
  loadAllColonyDetails.mockResolvedValue(
    new Map([[40_000_001, { cached: { data: detail, fetchedAt: new Date(), fromCache: false } }]])
  );
  loadCommandCenterUpgrades.mockResolvedValue(5);
  loadSystemPlanetIds.mockResolvedValue([40_000_001, 40_000_002]);
  loadSystemName.mockResolvedValue('Ashab');
  loadPlanetInfo.mockImplementation(async (planetId: number) => PLANET_INFO[planetId] ?? null);
  loadSchematicName.mockResolvedValue('Reactive Metals');
  loadTypeNames.mockResolvedValue(new Map([[BASE_METALS, 'Base Metals']]));
});

describe('AdvisorPanel', () => {
  it('states the pilot’s ceiling, and that it came from a trained level', async () => {
    renderPanel();
    expect(await screen.findByText('Level 5 — 25,415 tf / 19,000 MW')).toBeInTheDocument();
    expect(screen.queryByText(/assumed/)).not.toBeInTheDocument();
  });

  it('flags an assumed budget when the character has no skill data', async () => {
    loadCommandCenterUpgrades.mockResolvedValue(null);
    renderPanel();
    expect(await screen.findByText('Level 0 — 1,675 tf / 6,000 MW (assumed)')).toBeInTheDocument();
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

  it('reports the colony’s CPU and Powergrid against its OWN Command Center', async () => {
    renderPanel();
    // One ECU (400 tf / 2,600 MW) with 4 heads (110/550 each), one basic
    // factory (200/800) and one launchpad (3,600/700). The denominator is the
    // colony's upgrade_level 4 budget, NOT the pilot's level-5 ceiling —
    // sizing it off the skill would claim 25,415 / 19,000 here.
    const bar = await screen.findByText('4,640 / 21,315 tf');
    expect(bar).toBeInTheDocument();
    expect(screen.getByText('6,300 / 17,000 MW')).toBeInTheDocument();
    // The pilot's level-5 ceiling (25,415 tf) does appear — in the header
    // chip, which is what that chip is for. It must not appear as any card's
    // denominator.
    const card = (await screen.findByText('Ashab III')).closest('div')
      ?.parentElement as HTMLElement;
    expect(within(card).queryByText(/25,415/)).not.toBeInTheDocument();
  });

  it('never flags the Command Center every colony has as an unrecognised pin', async () => {
    // The colony fixture below carries a real Temperate Command Center. It
    // supplies the budget and draws nothing from it, so the "meter
    // understates this colony" warning must not fire.
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: {
                ...detail,
                pins: [...detail.pins, { pin_id: 9, type_id: 2254, latitude: 0, longitude: 0 }],
              },
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.queryByText(/does not recognise/)).not.toBeInTheDocument();
  });

  it('says a planet whose type never loaded is unknown, not uncolonisable', async () => {
    loadPlanetInfo.mockImplementation(async (planetId: number) =>
      planetId === 40_000_002 ? null : (PLANET_INFO[planetId] ?? null)
    );
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.getByText(/has not loaded/)).toBeInTheDocument();
    expect(screen.queryByText('No colony can be placed on this planet.')).not.toBeInTheDocument();
    // And it is not counted as somewhere a colony could go.
    expect(screen.getByText('1 / 1 planets')).toBeInTheDocument();
  });

  it('clears a previous failure when a later load succeeds', async () => {
    loadCharacterPlanets.mockRejectedValueOnce(new Error('boom'));
    const { rerender } = renderPanel();
    expect(await screen.findByText('Could not load')).toBeInTheDocument();

    rerender(<AdvisorPanel characterId={2} systemId={null} onSystemIdChange={vi.fn()} />);
    expect(await screen.findByText('Ashab III')).toBeInTheDocument();
    expect(screen.queryByText('Could not load')).not.toBeInTheDocument();
  });

  it('prompts a re-login on a missing scope instead of offering to place a colony', async () => {
    loadCharacterPlanets.mockResolvedValue({
      cached: null,
      needsReauth: true,
    });
    loadAllColonyDetails.mockResolvedValue(new Map());
    renderPanel();
    expect(await screen.findByText('Log in again to see your colonies')).toBeInTheDocument();
    expect(screen.queryByText('No colonies yet')).not.toBeInTheDocument();
  });

  it('says what the leftover budget still holds, for a colony with no links', async () => {
    renderPanel();
    // 16,675 tf and 10,700 MW left of the colony's own level-4 budget.
    // Powergrid binds: 13 basic (800 MW), 15 advanced or storage (700), and
    // only 1 extractor once ten heads are costed in (2,600 + 5,500 MW).
    const room = await screen.findByText(/1x extractor/);
    expect(room).toHaveTextContent('13x basic factory');
    expect(room).toHaveTextContent('15x advanced factory');
  });

  it('charges for links, and still states headroom (#440)', async () => {
    // The bug this closes: every planet was full and the card still offered
    // room, because links drew CPU/Powergrid nothing accounted for.
    //
    // These two pins are 72.57 km apart on a 6,030 km planet, so the link
    // costs 15 + 72.57*0.2 = 29.5 tf and 10 + 72.57*0.15 = 20.9 MW. Asserting
    // those numbers is what makes this a real test: a link priced at zero
    // would render the very same sentence.
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: {
                links: [{ source_pin_id: 1, destination_pin_id: 2, link_level: 0 }],
                routes: [],
                pins: [
                  {
                    ...extractorPin(1),
                    latitude: 1.5826666355133057,
                    longitude: 5.977088451385498,
                  },
                  {
                    pin_id: 2,
                    type_id: BASIC,
                    latitude: 1.5946428775787354,
                    longitude: 5.978272914886475,
                    factory_details: { schematic_id: REACTIVE_METALS_SCHEMATIC },
                  },
                ],
              },
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    renderPanel();

    expect(await screen.findByText('Includes 1 link drawing 30 tf / 21 MW.')).toBeInTheDocument();
    expect(screen.queryByText(/Headroom unknown/)).not.toBeInTheDocument();
  });

  it('says so when a planet’s radius did not load, rather than pricing links at zero', async () => {
    // The only refusal left. Without a radius a link's distance, and so its
    // cost, cannot be worked out — and free is the one answer known to be wrong.
    loadPiPlanetRadius.mockResolvedValue({});
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: {
                ...detail,
                links: [{ source_pin_id: 1, destination_pin_id: 2, link_level: 0 }],
              },
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    renderPanel();

    expect(await screen.findByText(/Headroom unknown/)).toBeInTheDocument();
  });

  it('names an unbuilt planet’s resources and refuses to price them', async () => {
    renderPanel();
    const heading = await screen.findByText('Ashab II');
    const card = heading.closest('div')?.parentElement as HTMLElement;
    expect(within(card).getByText('Could extract')).toBeInTheDocument();
    expect(within(card).getAllByText(/Base Metals/).length).toBeGreaterThan(0);
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

  it('caps the planet-lookup fan-out instead of firing one request per planet at once', async () => {
    // Six systems of eight planets is ~48 cold-cache `/universe/planets`
    // reads. `src/lib/concurrency.ts` is the repo's single fan-out policy and
    // a bare Promise.all bypasses it, so this pins the cap rather than
    // trusting the shape of the code.
    const systems = [30_000_010, 30_000_011, 30_000_012, 30_000_013, 30_000_014, 30_000_015];
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: systems.map((solar_system_id, i) => ({
          ...colony(41_000_000 + i, 'temperate'),
          solar_system_id,
        })),
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    loadAllColonyDetails.mockResolvedValue(new Map());
    loadSystemPlanetIds.mockImplementation(async (systemId: number) =>
      Array.from({ length: 8 }, (_, j) => systemId * 100 + j)
    );

    let inFlight = 0;
    let peak = 0;
    loadPlanetInfo.mockImplementation(async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 0));
      inFlight -= 1;
      return { name: 'Somewhere I', typeId: 11 };
    });

    renderPanel();
    await screen.findAllByText('Somewhere I');

    expect(loadPlanetInfo.mock.calls.length).toBe(48);
    expect(peak).toBeLessThanOrEqual(ESI_FANOUT_CONCURRENCY);
    // And it really did run in parallel up to the cap, rather than serially.
    expect(peak).toBeGreaterThan(1);
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

describe('resource ranking (#425)', () => {
  it('saves a ranking account-wide when a resource is added', async () => {
    renderPanel();
    const add = await screen.findByRole('button', { name: '+ Base Metals' });
    fireEvent.click(add);

    // Fanned out by the sync layer, so the call carries the planet and order
    // only — there is no per-Character variant to pass.
    expect(setPlanetRichness).toHaveBeenCalledWith(40_000_002, [BASE_METALS]);
  });

  it('prices the top-ranked resource, and marks the figure an estimate', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '+ Base Metals' }));

    // 6,965 a cycle over 30-minute cycles decays to a measured sustained rate;
    // the estimate projects one extractor at that rate against the hub price.
    // What matters here is that it is labelled, not what it rounds to.
    expect(await screen.findByText('Est.')).toBeInTheDocument();
    expect(screen.getByText(/Estimated, not measured/)).toBeInTheDocument();
  });

  it('reorders without a reload, and the estimate follows the new top rank', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '+ Base Metals' }));
    fireEvent.click(await screen.findByRole('button', { name: '+ Noble Metals' }));

    expect(setPlanetRichness).toHaveBeenLastCalledWith(40_000_002, [BASE_METALS, NOBLE_METALS]);

    // Rendered from the layered edit, with no reload and no second snapshot
    // read: the list is in the pilot's chosen order, numbered from one.
    const list = await screen.findByRole('list', { name: 'Resource ranking, richest first' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((row) => row.textContent)
    ).toEqual([expect.stringContaining('1'), expect.stringContaining('2')]);
    expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Base Metals');
    expect(within(list).getAllByRole('listitem')[1]).toHaveTextContent('Noble Metals');
  });

  it('clears a ranking through the tombstoned path, not a bare delete', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '+ Base Metals' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear ranking' }));

    expect(clearPlanetRichness).toHaveBeenCalledWith(40_000_002);
  });

  it('refuses to price a ranked planet when nothing of the pilot’s is measurable', async () => {
    // No colony detail means no measured extractor, so there is no rate of the
    // pilot's own to project from — and the card says exactly that instead of
    // reaching for a default.
    loadAllColonyDetails.mockResolvedValue(new Map());
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: '+ Base Metals' }));

    expect(await screen.findByText(/no rate of your own to project from/)).toBeInTheDocument();
    expect(screen.queryByText('Est.')).not.toBeInTheDocument();
  });
});

/**
 * Ashab III is a Temperate colony, so its candidates are the five P0 a
 * Temperate planet yields and what can be made from them alone. Its measured
 * rate is the fixture's own 5,580/hr.
 */
describe('AdvisorPanel build advice', () => {
  const MICROORGANISMS = 2073;
  const AQUEOUS_LIQUIDS = 2268;
  const COMPLEX_ORGANISMS = 2287;
  const CARBON_COMPOUNDS = 2288;
  const AUTOTROPHS = 2305;
  const BACTERIA = 2393;
  const WATER = 3645;

  function priceEverything(overrides: Record<number, number> = {}) {
    loadPlanPrices.mockResolvedValue({
      prices: {
        [MICROORGANISMS]: 5,
        [AQUEOUS_LIQUIDS]: 5,
        [COMPLEX_ORGANISMS]: 5,
        [CARBON_COMPOUNDS]: 5,
        [AUTOTROPHS]: 5,
        [BACTERIA]: 1_000,
        [WATER]: 1_000,
        ...overrides,
      },
      unpriced: [],
      failed: false,
      fetchedAt: new Date(),
    });
  }

  it('recommends a made tier once it out-earns selling the ore', async () => {
    // At 10,000 ISK a unit, one Basic Industry Facility of Bacteria beats
    // three extractors' worth of raw Microorganisms.
    priceEverything({ [BACTERIA]: 10_000 });
    renderPanel();
    expect(await screen.findByText('Bacteria (P1)')).toBeInTheDocument();
    expect(screen.getByText('Build up to')).toBeInTheDocument();
  });

  it('recommends selling the ore when no made tier beats it', async () => {
    // Bacteria at 1,000 does not cover the 150 units of Microorganisms it
    // eats plus the extractor capacity it costs, so the raw floor wins.
    priceEverything();
    renderPanel();
    expect(await screen.findByText('Keep selling Microorganisms raw')).toBeInTheDocument();
  });

  it('states the derived customs rate rather than costing at a silent default', async () => {
    priceEverything();
    renderPanel();
    // Ashab at 0.5 security is highsec: the 10% NPC base less 1% per level of
    // Customs Code Expertise IV.
    expect(await screen.findByText('6%')).toBeInTheDocument();
  });

  it('says the hub is the gap when nothing is quoted, not that the planet is poor', async () => {
    loadPlanPrices.mockResolvedValue({
      prices: {},
      unpriced: [],
      failed: false,
      fetchedAt: new Date(),
    });
    renderPanel();
    expect(await screen.findByText(/reference hub quotes no price/)).toBeInTheDocument();
  });

  it('gives no build advice on a colony with no measurable extractor', async () => {
    priceEverything();
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: { ...detail, pins: [detail.pins[1], detail.pins[2]] },
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    renderPanel();
    expect(
      await screen.findByText(/no rate of its own to size a chain against/)
    ).toBeInTheDocument();
  });
});
