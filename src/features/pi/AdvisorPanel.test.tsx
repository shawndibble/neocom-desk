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
import { useMarketSourcing } from './marketSourcingPref';
import { useAltColonies } from './altColoniesPref';

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
const readCachedSystemSecurity = vi.fn();
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
const loadPlanPrices = vi.fn<(...args: unknown[]) => Promise<import('./planPrices').PlanPrices>>();
vi.mock('./planPrices', () => ({
  loadPlanPrices: (...args: unknown[]) => loadPlanPrices(...args),
}));
const loadPiRosterSnapshot = vi.fn();
vi.mock('./roster', () => ({ loadPiRosterSnapshot: () => loadPiRosterSnapshot() }));

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
  readCachedSystemSecurity: (...args: unknown[]) => readCachedSystemSecurity(...args),
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

/** A refining colony's pin detail: one extractor feeding `factories` Basic pins. */
function refineryDetail(
  schematicId: number,
  productTypeId: number,
  factories = 3,
  qtyPerCycle = 20_000
): CharacterPlanetDetail {
  return {
    links: [],
    routes: [],
    pins: [
      {
        ...extractorPin(1),
        extractor_details: {
          ...(extractorPin(1).extractor_details as NonNullable<PlanetPin['extractor_details']>),
          qty_per_cycle: qtyPerCycle,
          product_type_id: productTypeId,
        },
      },
      ...Array.from({ length: factories }, (_, i) => ({
        pin_id: i + 2,
        type_id: BASIC,
        latitude: 0,
        longitude: 0,
        factory_details: { schematic_id: schematicId },
      })),
      { pin_id: 9, type_id: LAUNCHPAD, latitude: 0, longitude: 0 },
    ],
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

/**
 * Open a colony's detail modal.
 *
 * The card states the instruction; the measurement and economics that justify
 * it live here. A test asserting the reasoning therefore has to go where a
 * pilot would - which is the point of the split, and why these assertions were
 * moved rather than deleted.
 */
async function openDetails(planet = 'Ashab III') {
  await userEvent.click(await screen.findByRole('button', { name: `Details for ${planet}` }));
  return screen.getByRole('dialog');
}

beforeEach(() => {
  // A module-scoped store outlives the test that set it, and buying changes
  // what every card says. Back to the shipped default each time.
  useMarketSourcing.setState({ value: 'none', hydrated: true });
  useAltColonies.setState({ value: false, hydrated: true });
  loadPiRosterSnapshot.mockResolvedValue({
    colonies: [],
    skipped: [],
    notLoaded: [],
    noColonies: [],
  });
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
    readCachedSystemSecurity,
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
    buyPrices: {},
    unpriced: [],
    failed: false,
    fetchedAt: new Date(),
  });
  // Ashab is highsec, and the character has Customs Code Expertise IV — so
  // every chain below is costed at the 6% these two imply.
  loadSystemSecurity.mockResolvedValue(0.5);
  readCachedSystemSecurity.mockResolvedValue(0.5);
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
    // The pilot's level-5 ceiling (25,415 tf) does appear — in the header
    // chip, which is what that chip is for. It must not appear as any card's
    // denominator, and the card now carries percentages rather than figures.
    const card = (await screen.findByText('Ashab III')).closest('div')
      ?.parentElement as HTMLElement;
    expect(within(card).queryByText(/25,415/)).not.toBeInTheDocument();

    const dialog = await openDetails();
    expect(within(dialog).getByText('4,640 / 21,315 tf')).toBeInTheDocument();
    expect(within(dialog).getByText('6,300 / 17,000 MW')).toBeInTheDocument();
    expect(within(dialog).queryByText(/25,415/)).not.toBeInTheDocument();
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

  it('still prints the leftover budget, underneath the advice rather than as it', async () => {
    // 16,675 tf and 10,700 MW left of the colony's own level-4 budget. The
    // figure is worth having — a pilot checking the arithmetic needs it — but
    // as a footnote under a decision, not as the decision.
    renderPanel();
    const dialog = await openDetails();
    expect(
      within(dialog).getByText(/16,675 tf and 10,700 MW free as it stands/)
    ).toBeInTheDocument();
  });

  it('leads with what to do here, not with a list of what would fit', async () => {
    // The row this replaced offered "1x basic factory · 1x advanced factory ·
    // 2x high-tech plant · 1x storage · 1x launchpad". Every count was right
    // and it was still the wrong answer: a pilot cannot act on a menu of pins
    // whose contents nothing on the card names, and said so three times. The
    // caveat that followed it ("any one of those, not all of them") was a
    // repair to a shape that should not have been a list at all.
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.getAllByText('Do this').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Any one of those/)).not.toBeInTheDocument();
    expect(screen.queryByText(/x high-tech plant/)).not.toBeInTheDocument();
  });

  it('keeps the detail modal open across a re-render', async () => {
    // `openColony` is looked up by planetId from the freshly derived advice
    // rather than stored, so a refresh that reshapes the snapshot cannot
    // strand a stale colony behind an open dialog — or close it out from
    // under a reader.
    const { rerender } = renderPanel();
    const dialog = await openDetails();
    expect(within(dialog).getByText('Running now')).toBeInTheDocument();

    rerender(<AdvisorPanel characterId={1} systemId={null} onSystemIdChange={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAttribute('open');
    expect(within(screen.getByRole('dialog')).getByText('Running now')).toBeInTheDocument();
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

    // The charge is still made — `spareCapacity` takes it — and the modal's
    // footnote is where it is stated, priced off this colony's own geometry.
    const dialog = await openDetails();
    expect(
      within(dialog).getByText(/A new pin also pays for its link here: 30 tf \/ 21 MW/)
    ).toBeInTheDocument();
  });

  it('claims no link price on a colony with no link to measure one from', async () => {
    // Zero links is not "links are free here". With nothing to price a hop
    // from, the footnote states the remainder and stops — quoting a link cost
    // this colony's geometry cannot support would be the invented number.
    renderPanel();
    const dialog = await openDetails();
    within(dialog).getByText(/16,675 tf and 10,700 MW free as it stands/);
    expect(within(dialog).queryByText(/A new pin also pays for its link/)).not.toBeInTheDocument();
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

  it('says what the next Command Center level buys, without re-offering a menu', async () => {
    // "Need to look into how that will adjust the advisor and its
    // suggestions." The nudge used to append "room for 6x High-Tech
    // Production Plant · …", which is the shape the card stopped using — and
    // it printed outside the guard, so it made a headroom claim on the one
    // colony the card had just declined to advise at all. What a level adds is
    // pure budget arithmetic and true everywhere; what it would then hold is
    // advice about a purchase the pilot has not made.
    renderPanel();
    const dialog = await openDetails();
    const nudge = within(dialog).getByText(/Command Center at level/);
    expect(nudge).toHaveTextContent('MW');
    expect(nudge).not.toHaveTextContent('room for');
  });

  it('starts with no hub, and offers the ones the rest of the app uses', async () => {
    // Buying assumes a trade hub you can actually reach, so nothing is assumed
    // until the pilot names one. It was a checkbox, which forced every figure
    // on the tab through Jita whether or not that was their market.
    renderPanel();
    const select = await screen.findByRole('combobox', { name: 'Buy inputs at' });
    expect(select).toHaveTextContent('None');

    await userEvent.click(select);
    for (const hub of ['Jita', 'Amarr', 'Dodixie', 'Rens', 'Hek']) {
      expect(await screen.findByRole('option', { name: hub })).toBeInTheDocument();
    }
  });

  it('prices the whole tab at the hub the pilot picked', async () => {
    // The control is both the permission and the price basis: an Amarr pilot's
    // margins are Amarr's, not Jita's read through an Amarr-shaped label.
    useMarketSourcing.setState({ value: 'amarr', hydrated: true });
    renderPanel();
    await screen.findByText('Ashab III');

    expect(loadPlanPrices).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'amarr' }),
      expect.anything()
    );
  });

  it('still prices output at the reference hub when no hub is picked', async () => {
    // 'none' refuses to plan a purchase; it does not refuse to value the
    // output, which still has to be priced somewhere.
    renderPanel();
    await screen.findByText('Ashab III');

    expect(loadPlanPrices).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'jita' }),
      expect.anything()
    );
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
    const dialog = await openDetails();
    expect(within(dialog).getByText(/level 4.*allows 5/)).toBeInTheDocument();
    expect(within(dialog).getByText(/4,100 tf and 2,000 MW/)).toBeInTheDocument();
  });

  it('does not push an upgrade off a skill level it had to assume', async () => {
    // Structurally this is also guaranteed — `maxColonyBudget` reports level 0
    // when it had to assume, and no colony's `upgrade_level` is below zero —
    // so this asserts the behaviour rather than the branch. The explicit
    // `!ceiling.assumed` guard beside it states the intent for the next reader
    // and survives a change to either of those two facts.
    loadCommandCenterUpgrades.mockResolvedValue(null);
    renderPanel();
    const dialog = await openDetails();
    expect(within(dialog).queryByText(/allows/)).not.toBeInTheDocument();
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
    const dialog = await openDetails();
    expect(within(dialog).getByText(/13,715 tf and 300 MW free as it stands/)).toBeInTheDocument();
    const closest = within(dialog).getByText(/Nothing more fits as it stands/);
    expect(closest).toHaveTextContent('High-Tech Production Plant');
    expect(closest).toHaveTextContent('400 MW');
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
    // draw budget and make nothing. The card states that as the action —
    // remove them — with the measurement that justifies it in the same line,
    // rather than as a separate observation the pilot has to act on themselves.
    const what = await screen.findByText('4× Basic Industry Facility — nothing feeds them');
    const row = what.closest('div')?.parentElement as HTMLElement;
    expect(within(row).getByText('Remove')).toBeInTheDocument();
    // Four Basic Industry Facilities at 200 tf / 800 MW.
    expect(row).toHaveTextContent('+800 tf · 3,200 MW');

    // The measurement that justifies it is one click away, not gone.
    const dialog = await openDetails();
    const why = within(dialog).getByText(/They draw 30,000\/hr of Base Metals/);
    expect(why).toHaveTextContent('5,580/hr');
  });

  it('offers to feed the idle facilities when the Powergrid is there for it', async () => {
    // The other half of the trade, and the half the pilot had to point out:
    // removing capacity is the wrong answer on a colony whose own card says
    // keep selling this P1 raw, because every unit that reaches an idle
    // facility is another P1 sold. Whether it is available is a Powergrid
    // question, and an Extractor Control Unit is 2,600 MW before a head.
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
                  ...Array.from({ length: 2 }, (_, i) => ({
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
    const dialog = await openDetails();
    expect(
      within(dialog).getByText(/Add 1x Extractor Control Unit and \d+ heads/)
    ).toBeInTheDocument();
  });

  it('says nothing about unfed factories on a colony that is in balance', async () => {
    // The default fixture's single factory is fed, so there is no line — a
    // reassurance on every card would bury the ones with something to act on.
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.queryByText(/pins are fed/)).not.toBeInTheDocument();
  });

  /**
   * Two colonies that reach a P2 only together: Ashab III refines
   * Microorganisms into Bacteria, Ashab IV refines Aqueous Liquids into Water,
   * and neither planet can extract the other's P0. Shared because the tests
   * below differ only in what the hub quotes.
   */
  const WATER_SCHEMATIC = 121;
  const BACTERIA_SCHEMATIC = 131;
  const AQUEOUS_LIQUIDS = 2268;
  const MICROORGANISMS = 2073;
  const WATER = 3645;
  const BACTERIA = 2393;
  const TEST_CULTURES = 2319;

  function twoRefineries(
    prices: Record<number, number>,
    pins: [number, number] = [3, 3],
    qty: [number, number] = [20_000, 20_000],
    pads: [number, number] = [1, 1]
  ) {
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
    const refinery = (
      schematicId: number,
      productTypeId: number,
      factories: number,
      qtyPerCycle: number,
      launchpads: number
    ) => ({
      links: [],
      routes: [],
      pins: [
        {
          ...extractorPin(1),
          extractor_details: {
            ...(extractorPin(1).extractor_details as NonNullable<PlanetPin['extractor_details']>),
            qty_per_cycle: qtyPerCycle,
            product_type_id: productTypeId,
          },
        },
        ...Array.from({ length: factories }, (_, i) => ({
          pin_id: i + 2,
          type_id: BASIC,
          latitude: 0,
          longitude: 0,
          factory_details: { schematic_id: schematicId },
        })),
        ...Array.from({ length: launchpads }, (_, i) => ({
          pin_id: 100 + i,
          type_id: LAUNCHPAD,
          latitude: 0,
          longitude: 0,
        })),
      ],
    });
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          {
            cached: {
              data: refinery(BACTERIA_SCHEMATIC, MICROORGANISMS, pins[0], qty[0], pads[0]),
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
        [
          40_000_003,
          {
            cached: {
              data: refinery(WATER_SCHEMATIC, AQUEOUS_LIQUIDS, pins[1], qty[1], pads[1]),
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
    loadPlanPrices.mockResolvedValue({
      prices,
      buyPrices: {},
      unpriced: [],
      failed: false,
      fetchedAt: new Date(),
    });
  }

  it('says what two colonies could make together that neither makes alone', async () => {
    // The reported operation in miniature. Ashab III refines Microorganisms
    // into Bacteria; Ashab IV refines Aqueous Liquids into Water. Neither
    // planet can extract the other's P0, so both cards say "keep selling raw"
    // — and together they make Test Cultures.
    twoRefineries({
      [MICROORGANISMS]: 12,
      [AQUEOUS_LIQUIDS]: 12,
      [WATER]: 513.9,
      [BACTERIA]: 490,
      [TEST_CULTURES]: 10_000,
    });
    renderPanel();

    // Named twice on purpose: the "Together" panel says the set can reach it,
    // and the host planet's own card says to build it. The pilot reads the
    // card, so the card carries the routes and the ISK.
    expect(
      (await screen.findAllByText(/Test Cultures — \d+× Advanced Industry Facility/)).length
    ).toBeGreaterThan(0);
    // The route is the work: an opportunity with no shipping named is not
    // actionable.
    expect(screen.getAllByText(/(Water|Bacteria) \d+\/hr · Ashab/).length).toBeGreaterThan(0);
  });

  it('separates what a factory would buy from what it merely gives up', async () => {
    // Buying is off by default — it assumes a hub within reach — so this is
    // the opted-in state, set the way the checkbox sets it.
    useMarketSourcing.setState({ value: 'jita', hydrated: true });
    // The pilot asked to "take into account the cost of buying it on the local
    // market hub". Superconductors need Plasmoids, which neither colony makes,
    // so those are a purchase — while the Water feeding the same factory is
    // material they already grow. Both cost the hub price; only one is money
    // leaving the wallet, and one figure under one word for both is how a
    // pilot budgets for a purchase they are not making.
    const PLASMOIDS = 2389;
    const SUPERCONDUCTORS = 9838;
    twoRefineries({
      [MICROORGANISMS]: 12,
      [AQUEOUS_LIQUIDS]: 12,
      [WATER]: 513.9,
      [BACTERIA]: 490,
      [PLASMOIDS]: 600.2,
      [SUPERCONDUCTORS]: 11_280,
    });
    renderPanel();

    expect((await screen.findAllByText(/Plasmoids \d+\/hr · buy at /)).length).toBeGreaterThan(0);
    // The Water is routed, not bought, so it must not appear as a purchase.
    expect(screen.queryByText(/Water \d+\/hr · buy at /)).not.toBeInTheDocument();
    // And the two are still told apart in words, one click into the host card
    // — whichever of the two planets the plan put the factory on.
    const host = screen
      .getAllByRole('button', { name: /^Details for / })
      .map((button) => button.closest('div.flex.flex-col') as HTMLElement)
      .find((card) => within(card).queryByText(/Plasmoids \d+\/hr · buy at /));
    fireEvent.click(within(host as HTMLElement).getByRole('button', { name: /^Details for / }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/an hour of inputs you have to buy/)).toBeInTheDocument();
  });

  it('names what buying would reach, rather than going quiet when it is off', async () => {
    // Off is the default, because buying assumes a hub within reach. It must
    // not mean silence: the complaint that started this work was a card that
    // offered pins without ever saying what goes in them, and "you make one of
    // the two inputs for this" is exactly what a pilot needs to decide whether
    // the trip is worth it.
    twoRefineries({
      [MICROORGANISMS]: 12,
      [AQUEOUS_LIQUIDS]: 12,
      [WATER]: 513.9,
      [BACTERIA]: 490,
      [TEST_CULTURES]: 10_000,
    });
    renderPanel();
    await screen.findByText('Ashab III');
    expect(screen.getByText(/would also be reachable by hauling inputs in/)).toBeInTheDocument();
  });

  it('combines colonies that are not in the same system', async () => {
    // "If a player has a bunch of alts, they may have like 20 colonies." The
    // plan used to run one system at a time, so a pilot whose two refineries
    // sat in different systems was told each planet could only sell raw — the
    // exact blindness this surface exists to remove. Only the *host's* customs
    // office enters a chain's cost, so spanning systems needs the rate per
    // planet, not a second tax model.
    const OTHER = 30_002_188;
    twoRefineries({
      [MICROORGANISMS]: 12,
      [AQUEOUS_LIQUIDS]: 12,
      [WATER]: 513.9,
      [BACTERIA]: 490,
      [TEST_CULTURES]: 10_000,
    });
    // Move the Water colony one system over, and give that system its own
    // planet list so its card still resolves.
    loadCharacterPlanets.mockResolvedValue({
      cached: {
        data: [
          colony(40_000_001, 'temperate'),
          { ...colony(40_000_003, 'barren'), planet_id: 40_000_003, solar_system_id: OTHER },
        ],
        fetchedAt: new Date(),
        fromCache: false,
      },
      needsReauth: false,
    });
    loadSystemPlanetIds.mockImplementation(async (systemId: number) =>
      systemId === OTHER ? [40_000_003] : [40_000_001]
    );
    renderPanel();

    // Named in the "Together" panel even though the two planets are in
    // different systems and only one of them has a card on screen.
    expect(
      (await screen.findAllByText(/Test Cultures — \d+× Advanced Industry Facility/)).length
    ).toBeGreaterThan(0);
  });

  it('plans with another character’s colonies once asked to', async () => {
    // "If a player has a bunch of alts, they may have like 20 colonies." The
    // alt supplies the second P1, so the pair reaches a P2 that neither
    // character reaches alone — and the route names whose planet it is, because
    // "route in from Ashab IV" is not actionable if you have to log in as
    // somebody else to do it.
    useAltColonies.setState({ value: true, hydrated: true });
    loadPiRosterSnapshot.mockResolvedValue({
      colonies: [
        {
          characterId: 99,
          characterName: 'Alt Pilot',
          planet: {
            ...colony(40_000_003, 'barren'),
            planet_id: 40_000_003,
            solar_system_id: ASHAB,
          },
          detail: refineryDetail(121, 2268),
        },
      ],
      skipped: [],
      notLoaded: [],
      noColonies: [],
    });
    loadPlanPrices.mockResolvedValue({
      prices: {
        [2073]: 12,
        [2268]: 12,
        [3645]: 513.9,
        [2393]: 490,
        [2319]: 10_000,
      },
      buyPrices: {},
      unpriced: [],
      failed: false,
      fetchedAt: new Date(),
    });
    loadAllColonyDetails.mockResolvedValue(
      new Map([
        [
          40_000_001,
          { cached: { data: refineryDetail(131, 2073), fetchedAt: new Date(), fromCache: false } },
        ],
      ])
    );
    renderPanel();
    await screen.findByText('Ashab III');
    expect(
      (await screen.findAllByText(/Test Cultures — \d+× Advanced Industry Facility/)).length
    ).toBeGreaterThan(0);
    expect(screen.getByText(/\(Alt Pilot\)/)).toBeInTheDocument();
    // Cache-only for the alt's system: page open must not spend ESI just
    // because an alt has a colony there, even when that system is also the
    // active Character's own (as here) — the alt path always reads cache.
    expect(readCachedSystemSecurity).toHaveBeenCalledWith(ASHAB);
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
    const dialog = await openDetails();
    // Level 2 is 12,136 / 12,000 and level 3 is 17,215 / 15,000.
    expect(within(dialog).getByText(/5,079 tf and 3,000 MW/)).toBeInTheDocument();
    expect(within(dialog).queryByText(/13,279/)).not.toBeInTheDocument();
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

    const dialog = await openDetails();
    expect(within(dialog).getByText('1 link')).toBeInTheDocument();
    expect(within(dialog).getByText('30 tf / 21 MW')).toBeInTheDocument();
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

  it('offers an unbuilt planet’s resources as a pick, and waits for one', async () => {
    // The old card listed what the planet could extract and then priced
    // nothing, which is a statement a pilot can do nothing with. It now asks
    // the one question that decides something — and says so rather than
    // showing an empty recommendation.
    renderPanel();
    const heading = await screen.findByText('Ashab II');
    const card = heading.closest('div')?.parentElement as HTMLElement;
    expect(within(card).getByText('Pull which of these?')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Base Metals' })).toBeInTheDocument();
    expect(within(card).getByText(/Tick what you would pull here/)).toBeInTheDocument();
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
    // And it offers no pick, no plan and no Details: nothing can go here.
    expect(screen.queryByText('Pull which of these?')).not.toBeInTheDocument();
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

describe('resource picking (#425)', () => {
  it('saves a pick account-wide when a resource is ticked', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));

    // Fanned out by the sync layer, so the call carries the planet and the
    // picks only — there is no per-Character variant to pass.
    expect(setPlanetRichness).toHaveBeenCalledWith(40_000_002, [BASE_METALS]);
  });

  /**
   * A colony with one real link, so a hop can be measured off it. The default
   * fixture has none, and a planet with no colony has no geometry of its own —
   * which is exactly the state the refusal below covers.
   */
  function linkedColony() {
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
                  { pin_id: 3, type_id: LAUNCHPAD, latitude: 0, longitude: 0 },
                ],
              },
              fetchedAt: new Date(),
              fromCache: false,
            },
          },
        ],
      ])
    );
  }

  it('turns a pick into a build plan, and marks the figure an estimate', async () => {
    // This is what the ranking never did. The picked resource becomes the
    // candidate set `recommendStopTier` scores, sized against the pilot's own
    // Command Center ceiling and a hop borrowed from their own colonies — so
    // the control finally decides something. The projection is labelled; what
    // matters here is the badge, not what the figure rounds to.
    linkedColony();
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));

    expect(await screen.findByText('Est.')).toBeInTheDocument();
    expect(screen.getByText(/average extraction rate/)).toBeInTheDocument();
  });

  it('refuses a build plan off an assumed Command Center ceiling', async () => {
    // Untrained is one level, and fitting against it would tell a pilot at
    // Command Center Upgrades V that nothing fits here. Same rule the slot
    // count and the header chip follow: an assumed figure may be shown, never
    // acted on.
    loadCommandCenterUpgrades.mockResolvedValue(null);
    linkedColony();
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));

    expect(
      await screen.findByText(/an assumed budget is never fitted against/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Est.')).not.toBeInTheDocument();
  });

  it('refuses a build plan when no colony of the pilot’s can price a link', async () => {
    // Every pin of a fitted layout is charged a link, and an unbuilt planet
    // has no geometry to price one from. The default fixture's colony has no
    // links either, so there is no hop to borrow — and fitting links at zero
    // would overstate what fits by exactly the amount #440 was filed about.
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));

    expect(await screen.findByText(/no honest price for one/)).toBeInTheDocument();
    expect(screen.queryByText('Est.')).not.toBeInTheDocument();
  });

  it('adds a second pick without a reload, and un-ticks back off again', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Noble Metals' }));

    // Click order is preference order, and it is what the store keeps.
    expect(setPlanetRichness).toHaveBeenLastCalledWith(40_000_002, [BASE_METALS, NOBLE_METALS]);

    // Rendered from the layered edit, with no reload and no second snapshot
    // read: both chips report themselves pressed.
    const picked = await screen.findByRole('button', { name: 'Base Metals' });
    expect(picked).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Noble Metals' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    fireEvent.click(picked);
    expect(setPlanetRichness).toHaveBeenLastCalledWith(40_000_002, [NOBLE_METALS]);
  });

  it('clears the picks through the tombstoned path, not a bare delete', async () => {
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));

    expect(clearPlanetRichness).toHaveBeenCalledWith(40_000_002);
  });

  it('refuses to plan a picked planet when nothing of the pilot’s is measurable', async () => {
    // No colony detail means no measured extractor, so there is no rate of the
    // pilot's own to project from — and the card says exactly that instead of
    // reaching for a default.
    loadAllColonyDetails.mockResolvedValue(new Map());
    renderPanel();
    fireEvent.click(await screen.findByRole('button', { name: 'Base Metals' }));

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
      buyPrices: {},
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
    expect(
      await screen.findByText('Switch to extracting Microorganisms and sell it raw')
    ).toBeInTheDocument();
  });

  it('says “keep” only when the winning ore is the one already coming out', async () => {
    // `stopTier` scores every P0 the planet type yields, not just the one
    // being extracted, and this colony's extractor runs Base Metals while
    // Microorganisms wins. "Keep selling Microorganisms raw" reads as "carry
    // on" to a pilot who is not extracting it — a false status-quo claim, and
    // the one that made a reader take the recommended ore's price for the
    // extracted ore's when checking the arithmetic.
    priceEverything();
    renderPanel();
    await screen.findByText('Switch to extracting Microorganisms and sell it raw');
    expect(screen.queryByText(/^Keep selling/)).not.toBeInTheDocument();
    // And the output figure is flagged as a rebuilt colony's, not this one's.
    const dialog = await openDetails();
    expect(
      within(dialog).getByText(/what this colony would make rebuilt around it/)
    ).toBeInTheDocument();
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
      buyPrices: {},
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
