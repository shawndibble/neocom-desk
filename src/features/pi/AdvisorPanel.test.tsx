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
/**
 * Reactive Metals — a P1 the Basic Industry Facility runs, and the one whose
 * input is the Base Metals this fixture's extractor pulls. Schematic 133 sat
 * here for a long time under this name; it is Proteins, which eats Complex
 * Organisms, so anything measuring supply against demand read the colony as
 * importing its input.
 */
const REACTIVE_METALS_SCHEMATIC = 126;
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
const loadInterplanetaryConsolidation = vi.fn();

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

vi.mock('./planetSlots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./planetSlots')>()),
  loadInterplanetaryConsolidation: (...args: unknown[]) => loadInterplanetaryConsolidation(...args),
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
    loadInterplanetaryConsolidation,
    loadPlanPrices,
  ]) {
    mock.mockReset();
  }
  // Level IV — five colonies — so the default fixture has slots to spare and
  // only the tests that care about the cap have to say so.
  loadInterplanetaryConsolidation.mockResolvedValue(4);
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

  it('says the headroom counts are alternatives rather than a list to build together', async () => {
    // The reported bug. A pilot read "1x basic factory · 1x advanced factory ·
    // 2x high-tech plant · 1x storage · 1x launchpad" as five things they
    // could add, placed the basic factory, and found the colony full. Every
    // count was right; the sentence was not, and the engine's own docstring
    // has always said these are alternatives.
    renderPanel();
    await screen.findByText(/1x extractor/);
    expect(screen.getByText(/Any one of those, not all of them/)).toBeInTheDocument();
    // And the remainder those counts came out of, so the arithmetic is
    // checkable on the card instead of only in the engine.
    expect(screen.getByText(/16,675 tf and 10,700 MW free/)).toBeInTheDocument();
  });

  it('charges a new pin for the link it will need, not just for the pin', async () => {
    // Efa V in miniature: 448 MW free and a 400 MW High-Tech plant offered,
    // which could not be placed because the link it needed was 54 MW. Here
    // the same omission is worth one basic factory — 14 unlinked, 13 once the
    // 20.9 MW link this colony's own geometry prices is charged with it.
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

    const room = await screen.findByText(/x basic factory/);
    expect(room).toHaveTextContent('13x basic factory');
    expect(room).not.toHaveTextContent('14x basic factory');
    expect(
      screen.getByText(/pays for the link a new pin needs.*30 tf \/ 21 MW/)
    ).toBeInTheDocument();
  });

  it('calls the counts ceilings when the colony has no link to price one from', async () => {
    // Zero links is not "links are free here". The counts are still the best
    // answer available, and the card owes the reader the caveat rather than a
    // silently optimistic number.
    renderPanel();
    await screen.findByText(/1x extractor/);
    expect(screen.getByText(/These are ceilings/)).toBeInTheDocument();
  });

  it('counts the colony slots the pilot’s skill actually allows', async () => {
    // The header's "1 / 2 planets" is about this system. The pilot's own cap
    // is Interplanetary Consolidation, and it was nowhere on this tab — a
    // pilot at level IV read the system figure as their allowance.
    loadInterplanetaryConsolidation.mockResolvedValue(4);
    renderPanel();
    expect(await screen.findByText('1 / 5 used')).toBeInTheDocument();
  });

  it('counts colonies in every system against the cap, not just the one on screen', async () => {
    // The cap is per character. A pilot showing one system while running
    // colonies in three has one slot free, not four.
    loadInterplanetaryConsolidation.mockResolvedValue(4);
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [
          colony(40_000_001, 'temperate'),
          { ...colony(40_000_003, 'barren'), solar_system_id: 30_002_188 },
          { ...colony(40_000_004, 'barren'), solar_system_id: 30_002_189 },
          { ...colony(40_000_005, 'barren'), solar_system_id: 30_002_190 },
        ],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    renderPanel();
    expect(await screen.findByText('4 / 5 used')).toBeInTheDocument();
  });

  it('does not present an assumed colony cap as a fact', async () => {
    // Same rule the Command Center ceiling follows: a pilot whose /skills
    // never loaded is not a pilot with one colony.
    loadInterplanetaryConsolidation.mockResolvedValue(null);
    renderPanel();
    expect(await screen.findByText(/1 \/ 1 used \(assumed\)/)).toBeInTheDocument();
  });

  it('tells an unbuilt planet it has no slot to be built in', async () => {
    // Naming resources for a planet the pilot cannot colonise is advice they
    // cannot take. Ashab II is the unbuilt card in this fixture.
    loadInterplanetaryConsolidation.mockResolvedValue(0);
    renderPanel();
    const card = (await screen.findByText('Ashab II')).closest('div')?.parentElement as HTMLElement;
    expect(within(card).getByText(/No colony slot free/)).toBeInTheDocument();
  });

  it('tells every unbuilt planet how many colony slots are left', async () => {
    // The reported case, and the one the "no slot free" warning missed
    // entirely: six planets in the system, four colonies, five slots. Both
    // unbuilt cards are options, but only one of them can be taken, and
    // nothing on the tab said which of those two facts applied.
    loadInterplanetaryConsolidation.mockResolvedValue(4);
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [
          colony(40_000_001, 'temperate'),
          { ...colony(40_000_003, 'barren'), solar_system_id: 30_002_188 },
          { ...colony(40_000_004, 'barren'), solar_system_id: 30_002_189 },
          { ...colony(40_000_005, 'barren'), solar_system_id: 30_002_190 },
        ],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    renderPanel();
    const card = (await screen.findByText('Ashab II')).closest('div')?.parentElement as HTMLElement;
    expect(within(card).getByText(/1 of 5 colony slots free/)).toBeInTheDocument();
  });

  it('says what the next Command Center level would make room for', async () => {
    // "Need to look into how that will adjust the advisor and its
    // suggestions": naming the CPU and Powergrid a level adds is only half an
    // answer — the pilot is buying pins, not megawatts.
    renderPanel();
    const card = (await screen.findByText('Ashab III')).closest('div')
      ?.parentElement as HTMLElement;
    expect(within(card).getByText(/room for/)).toBeInTheDocument();
  });

  it('says nothing about slots on an unbuilt planet while one is free', async () => {
    loadInterplanetaryConsolidation.mockResolvedValue(4);
    renderPanel();
    const card = (await screen.findByText('Ashab II')).closest('div')?.parentElement as HTMLElement;
    expect(within(card).queryByText(/No colony slot free/)).not.toBeInTheDocument();
  });

  it('points out a Command Center the pilot’s skill could already upgrade', async () => {
    // The colony is at upgrade_level 4 and the pilot's Command Center
    // Upgrades is V. Powergrid is what binds every one of these colonies, and
    // 2,000 MW of it is sitting behind an ISK purchase the tab never mentioned.
    renderPanel();
    const card = (await screen.findByText('Ashab III')).closest('div')
      ?.parentElement as HTMLElement;
    expect(within(card).getByText(/level 4.*allows 5/)).toBeInTheDocument();
    expect(within(card).getByText(/4,100 tf and 2,000 MW/)).toBeInTheDocument();
  });

  it('does not push an upgrade off a skill level it had to assume', async () => {
    // Structurally this is also guaranteed — `maxColonyBudget` reports level 0
    // when it had to assume, and no colony's `upgrade_level` is below zero —
    // so this asserts the behaviour rather than the branch. The explicit
    // `!ceiling.assumed` guard beside it states the intent for the next reader
    // and survives a change to either of those two facts.
    loadCommandCenterUpgrades.mockResolvedValue(null);
    renderPanel();
    const card = (await screen.findByText('Ashab III')).closest('div')
      ?.parentElement as HTMLElement;
    expect(within(card).queryByText(/allows/)).not.toBeInTheDocument();
  });

  it('explains why nothing fits instead of printing a remainder beside “budget is spent”', async () => {
    // A full colony used to read "Nothing — the budget is spent." with
    // "13,226 tf and 448 MW free." directly beneath it, and a sentence about
    // what "each count" pays for when there were no counts. The remainder is
    // worth printing, but only attached to the thing it fails to buy.
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: {
                links: [],
                routes: [],
                pins: [
                  { pin_id: 1, type_id: LAUNCHPAD, latitude: 0, longitude: 0 },
                  ...Array.from({ length: 20 }, (_, i) => ({
                    pin_id: i + 2,
                    type_id: BASIC,
                    latitude: 0,
                    longitude: 0,
                    factory_details: { schematic_id: REACTIVE_METALS_SCHEMATIC },
                  })),
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
    // 7,600 tf and 16,700 MW drawn of 21,315 / 17,000 — so 13,715 tf spare and
    // 300 MW, against a High-Tech plant's 400 MW, the closest thing to fitting.
    const line = await screen.findByText(/Nothing fits/);
    expect(line).toHaveTextContent('13,715 tf and 300 MW free');
    expect(line).toHaveTextContent('high-tech plant');
    expect(screen.queryByText(/Each count pays/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Any one of those/)).not.toBeInTheDocument();
  });

  it('names the factories nothing on this colony feeds, and what removing them gives back', async () => {
    // The default fixture is one 4-head extractor and one Basic factory. A
    // Basic factory eats 6,000 Base Metals an hour and this program sustains
    // 5,580, so four of five pins are fed and one is not.
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: {
                links: [],
                routes: [],
                pins: [
                  extractorPin(1),
                  ...Array.from({ length: 5 }, (_, i) => ({
                    pin_id: i + 2,
                    type_id: BASIC,
                    latitude: 0,
                    longitude: 0,
                    factory_details: { schematic_id: REACTIVE_METALS_SCHEMATIC },
                  })),
                  { pin_id: 9, type_id: LAUNCHPAD, latitude: 0, longitude: 0 },
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
    // 5,580/hr against five pins wanting 30,000/hr keeps one fed, so four
    // draw budget and make nothing.
    const line = await screen.findByText(/1 of 5 basic factory pins are fed/);
    expect(line).toHaveTextContent('30,000/hr of Base Metals');
    expect(line).toHaveTextContent('5,580/hr');
    // Four Basic factories at 200 tf / 800 MW.
    expect(screen.getByText(/frees 800 tf and 3,200 MW/)).toBeInTheDocument();
  });

  it('says nothing about unfed factories on a colony that is in balance', async () => {
    // The default fixture's single factory is fed, so there is no line — a
    // reassurance on every card would bury the ones with something to act on.
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.queryByText(/pins are fed/)).not.toBeInTheDocument();
  });

  it('says what two colonies could make together that neither makes alone', async () => {
    // The reported operation in miniature. Ashab III refines Microorganisms
    // into Bacteria; Ashab IV refines Aqueous Liquids into Water. Neither
    // planet can extract the other's P0, so both cards say "keep selling raw"
    // — and together they make Test Cultures.
    const WATER_SCHEMATIC = 121;
    const BACTERIA_SCHEMATIC = 131;
    const AQUEOUS_LIQUIDS = 2268;
    const MICROORGANISMS = 2073;
    const WATER = 3645;
    const BACTERIA = 2393;
    const TEST_CULTURES = 2319;
    const waterColony = { ...colony(40_000_003, 'barren'), planet_id: 40_000_003 };
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [colony(40_000_001, 'temperate'), waterColony],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    loadSystemPlanetIds.mockResolvedValue([40_000_001, 40_000_003]);
    loadPlanetInfo.mockImplementation(async (planetId: number) =>
      planetId === 40_000_003 ? { name: 'Ashab IV', typeId: 2016 } : (PLANET_INFO[planetId] ?? null)
    );
    // Both colonies sized to feed a real factory: a 20,000-a-cycle program
    // sustains 16,026 P0/hr off the decay curve, which keeps 2.67 of three
    // Basic pins fed and so makes 107 P1/hr — enough for two Advanced
    // factories at 40 + 40.
    const refinery = (schematicId: number, productTypeId: number) => ({
      links: [],
      routes: [],
      pins: [
        {
          ...extractorPin(1),
          extractor_details: {
            ...(extractorPin(1).extractor_details as NonNullable<PlanetPin['extractor_details']>),
            qty_per_cycle: 20_000,
            product_type_id: productTypeId,
          },
        },
        ...Array.from({ length: 3 }, (_, i) => ({
          pin_id: i + 2,
          type_id: BASIC,
          latitude: 0,
          longitude: 0,
          factory_details: { schematic_id: schematicId },
        })),
        { pin_id: 9, type_id: LAUNCHPAD, latitude: 0, longitude: 0 },
      ],
    });
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: refinery(BACTERIA_SCHEMATIC, MICROORGANISMS),
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
        [
          40_000_003,
          {
            cached: {
              data: refinery(WATER_SCHEMATIC, AQUEOUS_LIQUIDS),
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    loadPlanPrices.mockResolvedValue({
      prices: {
        [MICROORGANISMS]: 12,
        [AQUEOUS_LIQUIDS]: 12,
        [WATER]: 513.9,
        [BACTERIA]: 490,
        [TEST_CULTURES]: 10_000,
      },
      unpriced: [],
      failed: false,
      fetchedAt: new Date(),
    });
    renderPanel();

    expect(await screen.findByText(/making Test Cultures/)).toBeInTheDocument();
    // The route is the work: an opportunity with no shipping named is not
    // actionable.
    expect(screen.getByText(/Route .* of (Water|Bacteria) from Ashab/)).toBeInTheDocument();
  });

  it('says nothing about a network when there is only one colony to work with', async () => {
    // One colony is the per-planet question, and its own card already answers
    // it. A panel headed "Together" over a single planet is noise.
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.queryByText('Together')).not.toBeInTheDocument();
  });

  it('does not tell a pilot whose skills never loaded to abandon a colony', async () => {
    // `planetSlots(null)` is one slot and `assumed`. Read as fact it tells a
    // pilot at Interplanetary Consolidation V — five free slots — to abandon a
    // colony. Same rule as the Command Center ceiling: an assumed figure may
    // be shown, never acted on.
    loadInterplanetaryConsolidation.mockResolvedValue(null);
    renderPanel();
    const card = (await screen.findByText('Ashab II')).closest('div')?.parentElement as HTMLElement;
    expect(within(card).queryByText(/No colony slot free/)).not.toBeInTheDocument();
  });

  it('prices the next Command Center level, not the whole jump to the ceiling', async () => {
    // Each level is its own ISK purchase. A level-2 colony under a level-V
    // pilot was told "upgrading this colony adds 13,279 tf and 7,000 MW",
    // which is three purchases described as one.
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [{ ...colony(40_000_001, 'temperate'), upgrade_level: 2 }],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    renderPanel();
    const card = (await screen.findByText('Ashab III')).closest('div')
      ?.parentElement as HTMLElement;
    // Level 2 is 12,136 / 12,000 and level 3 is 17,215 / 15,000.
    expect(within(card).getByText(/5,079 tf and 3,000 MW/)).toBeInTheDocument();
    expect(within(card).queryByText(/13,279/)).not.toBeInTheDocument();
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

    await userEvent.click(await screen.findByRole('combobox', { name: 'System' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Amarr' }));
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

  it('blames the Command Center, not prices, when nothing fits', async () => {
    // A level-0 Command Center supplies 1,675 tf — a Launchpad alone draws
    // 3,600, so no candidate is fittable. Saying "nothing covers its customs
    // tax" here would send the pilot to check prices that are fine.
    priceEverything();
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: detail,
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [{ ...colony(40_000_001, 'temperate'), upgrade_level: 0 }],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    renderPanel();
    expect(await screen.findByText(/Command Center hosts no whole chain/)).toBeInTheDocument();
    expect(screen.queryByText(/covers its own customs tax/)).not.toBeInTheDocument();
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
