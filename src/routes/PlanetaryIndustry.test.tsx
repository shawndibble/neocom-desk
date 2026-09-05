import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import '@/i18n';
import { db } from '@/db';
import { ACTIVE_CHARACTER_KEY, useActiveCharacter } from '@/stores/activeCharacter';
import { usePublicInfo } from '@/stores/publicInfo';
import { App } from '@/app/App';
import { expandChain } from '@/engine/pi/chain';
import type { PiData } from '@/sde/types';

/** The ticket's worked example, and the Plan tab's own default product. */
const BROADCAST_NODE = 2867;
const BROADCAST_NODE_NAME = 'Broadcast Node';
/** A P2 inside that chain, and deliberately *not* the default — see the deep-link test. */
const TRANSMITTER = 9840;
const TRANSMITTER_NAME = 'Transmitter';

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, vi.fn()],
    offlineReady: [false, vi.fn()],
    updateServiceWorker: vi.fn(),
  }),
}));

// The Plan tab needs the real recipe graph — its numbers are claims about the
// shipped `pi.json`, so a stub would pin nothing. Everything else this route
// never reads.
const piData = JSON.parse(
  readFileSync(resolve(process.cwd(), 'public/data/pi.json'), 'utf8')
) as PiData;

vi.mock('@/sde/loadSde', () => ({
  loadSkills: vi.fn(async () => []),
  loadTypes: vi.fn(async () => ({})),
  loadBlueprints: vi.fn(async () => ({})),
  loadPi: vi.fn(async () => piData),
}));

// The one price path, stubbed at the feature seam: `loadMarketSnapshot` goes
// to Fuzzwork, which this suite's MSW server (`onUnhandledRequest: 'error'`)
// rightly refuses. The real path is covered by `planPrices.test.ts`.
vi.mock('@/features/pi/planPrices', () => ({
  loadPlanPrices: vi.fn(async () => ({
    prices: Object.fromEntries(
      expandChain(BROADCAST_NODE, piData, { unitsPerHour: 1 }).nodes.map((node) => [
        node.typeId,
        [5, 760, 14_000, 100_000, 1_900_000][node.tier],
      ])
    ),
    unpriced: [],
    failed: false,
    fetchedAt: new Date(),
  })),
}));

const CHAR_ID = 91;
const ESI = 'https://esi.evetech.net';
const PLANET_ID = 40000001;
const SYSTEM_ID = 30000142;

const planetsPayload = [
  {
    solar_system_id: SYSTEM_ID,
    planet_id: PLANET_ID,
    planet_type: 'temperate' as const,
    owner_id: CHAR_ID,
    last_update: '2026-08-30T00:00:00Z',
    upgrade_level: 3,
    num_pins: 1,
  },
];

// Well in the past relative to "today" in this test environment, so the
// extractor always reads as expired regardless of when the suite runs.
const EXPIRED_TIME = '2020-01-01T00:00:00Z';

const detailPayload = {
  links: [],
  pins: [
    {
      pin_id: 1,
      type_id: 2848,
      latitude: 0,
      longitude: 0,
      expiry_time: EXPIRED_TIME,
      extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
    },
  ],
  routes: [],
};

const PRODUCT_ID = 2288;
const FACTORY_TYPE_ID = 3001;
const STORAGE_TYPE_ID = 3002;
const SCHEMATIC_ID = 131;

const NAMES: Record<number, { name: string; category: string }> = {
  [SYSTEM_ID]: { name: 'Jita', category: 'solar_system' },
  2848: { name: 'Extractor Control Unit', category: 'inventory_type' },
  [PRODUCT_ID]: { name: 'Felsic Magma', category: 'inventory_type' },
  [FACTORY_TYPE_ID]: { name: 'Basic Industry Facility', category: 'inventory_type' },
  [STORAGE_TYPE_ID]: { name: 'Storage Facility', category: 'inventory_type' },
};

/**
 * No extractor at all — two factory pins sharing a schematic, one storage
 * pin — for the Production/Infrastructure cards, which the base
 * `detailPayload` (a lone extractor) never exercises.
 */
const roleCardsDetailPayload = {
  links: [],
  routes: [],
  pins: [
    { pin_id: 10, type_id: FACTORY_TYPE_ID, latitude: 0, longitude: 0, schematic_id: SCHEMATIC_ID },
    { pin_id: 11, type_id: FACTORY_TYPE_ID, latitude: 0, longitude: 0, schematic_id: SCHEMATIC_ID },
    { pin_id: 12, type_id: STORAGE_TYPE_ID, latitude: 0, longitude: 0 },
  ],
};

/**
 * A colony one day into CCP's worked 14-day program (qty_per_cycle 6,965 on a
 * 30-minute cycle), built off a timestamp captured before the route loads so
 * the loader's own `loadedAt` is always at or after it. The extra minute of
 * install age absorbs the test's runtime: elapsed stays inside cycle 48 —
 * 24h to 24.5h — so the banked figure is the deterministic 513,262 of
 * `extraction.test.ts`, not a value that drifts with wall-clock timing.
 *
 * A day in is *not* decayed: `EFFICIENT_WINDOW_FRACTION` reads a trailing day
 * of output against the program's first day, and one day in those are the same
 * day. `decayedDetailPayload` below is the aged one.
 */
const BASE_NOW = Date.now();
const DAY_MS = 86_400_000;

const agedDetailPayload = {
  links: [],
  pins: [
    {
      pin_id: 2,
      type_id: 2848,
      latitude: 0,
      longitude: 0,
      install_time: new Date(BASE_NOW - DAY_MS - 60_000).toISOString(),
      expiry_time: new Date(BASE_NOW + 13 * DAY_MS).toISOString(),
      extractor_details: {
        heads: [{ head_id: 1, latitude: 0, longitude: 0 }],
        product_type_id: PRODUCT_ID,
        qty_per_cycle: 6965,
        cycle_time: 1800,
      },
    },
  ],
  routes: [],
};

/**
 * The same program five days in, where its trailing day runs at 24% of its
 * first — under `EFFICIENT_WINDOW_FRACTION` — with expiry still nine days off,
 * so the colony is decayed without being idle or expiring-soon.
 */
const decayedDetailPayload = {
  ...agedDetailPayload,
  pins: [
    {
      ...agedDetailPayload.pins[0],
      install_time: new Date(BASE_NOW - 5 * DAY_MS - 60_000).toISOString(),
      expiry_time: new Date(BASE_NOW + 9 * DAY_MS).toISOString(),
    },
  ],
};

const server = setupServer(
  http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json(planetsPayload)),
  http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
    HttpResponse.json(detailPayload)
  ),
  http.get(`${ESI}/universe/planets/${PLANET_ID}`, () =>
    HttpResponse.json({
      planet_id: PLANET_ID,
      name: 'Jita IV',
      system_id: SYSTEM_ID,
      type_id: 11,
      position: { x: 0, y: 0, z: 0 },
    })
  ),
  http.get(`${ESI}/characters/${CHAR_ID}/skills`, () =>
    HttpResponse.json({
      skills: [
        {
          skill_id: 33467,
          trained_skill_level: 4,
          active_skill_level: 4,
          skillpoints_in_skill: 90510,
        },
      ],
      total_sp: 90510,
    })
  ),
  http.post(`${ESI}/universe/names`, async ({ request }) => {
    const ids = (await request.json()) as number[];
    return HttpResponse.json(ids.filter((id) => NAMES[id]).map((id) => ({ id, ...NAMES[id] })));
  })
);

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(async () => {
  await db.characters.clear();
  await db.tokens.clear();
  await db.settings.clear();
  await db.esiCache.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: false });
  usePublicInfo.setState({ byCharacterId: {} });

  await db.characters.put({ characterId: CHAR_ID, name: 'Pilot One', ownerHash: 'oh', addedAt: 1 });
  await db.tokens.put({
    characterId: CHAR_ID,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes: ['esi-planets.manage_planets.v1'],
  });
  await db.settings.put({ key: ACTIVE_CHARACTER_KEY, value: CHAR_ID });
  window.history.pushState({}, '', '/planetary-industry');
});

const PLANETS_SCOPE = 'esi-planets.manage_planets.v1';

async function addAlt(characterId: number, name: string, scopes: string[]) {
  await db.characters.put({
    characterId,
    name,
    ownerHash: `oh${characterId}`,
    addedAt: characterId,
  });
  await db.tokens.put({
    characterId,
    accessToken: 'access-token',
    refreshToken: 'refresh',
    expiresAt: Date.now() + 3_600_000,
    scopes,
  });
}

/**
 * The per-colony row+drilldown wrapper for a planet, found by its own
 * heading and expanded (clicked open) if it wasn't already — the Colonies
 * panel is Concept C, summary-then-drill-down: a collapsed row carries only
 * status/expiry/product/pin-count text, and the extraction/production/
 * infrastructure cards a lot of these assertions check only mount once the
 * row's drilldown region is open.
 *
 * The cross-character timeline above the colonies panel names the same
 * planets, products and states, so a page-wide `getByText` is ambiguous here
 * by design — the two surfaces really do say the same words about the same
 * colony. An assertion about the pin table therefore says which panel it
 * means rather than loosening its counts.
 */
async function colonyPanelFor(name: RegExp): Promise<HTMLElement> {
  const heading = await screen.findByRole('heading', { name });
  const panel = heading.closest('div');
  if (!(panel instanceof HTMLElement)) throw new Error(`no colony panel for ${String(name)}`);
  // Scoped to the heading itself (the `<h3>`), not the whole panel: an
  // already-expanded region carries its own `InfoTooltip` button(s) (Last
  // Update, and Status for unknown/decayed), so a panel-wide
  // `getByRole('button')` is only unambiguous before expansion. The `<h3>`
  // wraps nothing but the summary row's trigger.
  const trigger = within(heading).getByRole('button');
  if (trigger.getAttribute('aria-expanded') !== 'true') fireEvent.click(trigger);
  await within(panel).findByRole('region');
  return panel;
}

/** The whole Colonies panel (every character's rows once the toggle is on), found by its own "N colony/colonies" header — as opposed to `colonyPanelFor`'s single-colony wrapper. */
function coloniesPanel(): HTMLElement {
  const heading = screen.getByRole('heading', { name: /colon(y|ies)$/i });
  const panel = heading.closest('section');
  if (!(panel instanceof HTMLElement)) throw new Error('no colonies panel found');
  return panel;
}

describe('PlanetaryIndustry', () => {
  it('lists a colony with its planet, and shows the extractor as expired from expiry_time alone', async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Extractor Control Unit')).toBeInTheDocument();
    expect(within(panel).getByText('Idle')).toBeInTheDocument();
    // The summary row's own expiry cell, the extraction card's Status chip,
    // and its Expires field all read "Expired" for an already-expired
    // extractor.
    expect(within(panel).getAllByText('Expired')).toHaveLength(3);
  });

  it('explains the staleness rule in the UI', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(
      screen.getByText(/only recalculates a colony's data when it's opened in the EVE client/)
    ).toBeInTheDocument();
  });

  it('shows the empty state when there are no colonies', async () => {
    server.use(http.get(`${ESI}/characters/${CHAR_ID}/planets`, () => HttpResponse.json([])));
    render(<App />);
    expect(await screen.findByText('No planetary colonies cached')).toBeInTheDocument();
  });

  it('shows a re-login prompt when the planets scope itself was revoked', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    render(<App />);
    expect(await screen.findByText('Log in again to see your colonies')).toBeInTheDocument();
  });

  it('shows the alt-colonies toggle alongside the re-login prompt, not instead of it, when an alt has cached colonies', async () => {
    // The active Character's own live load 403s...
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    // ...but an alt's colonies are already cached from a prior visit as that
    // character — exactly the case a cross-character surface exists for.
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: detailPayload,
      fetchedAt: Date.now(),
    });

    render(<App />);

    // The banner is not a substitute for the panel: both render.
    expect(await screen.findByText('Log in again to see your colonies')).toBeInTheDocument();
    const toggle = await screen.findByRole('button', { name: /show alt colonies/i });

    const user = userEvent.setup();
    await user.click(toggle);
    // No `universe/planets/{id}` mock is registered for the alt's planet in
    // this test, so it renders its "Planet #id" fallback — a real row for a
    // real (if unnamed) colony, not an error state.
    const altRow = screen.getByRole('button', { name: new RegExp(`Planet #${ALT_PLANET_ID}`) });
    expect(altRow).toHaveAttribute('aria-expanded', 'false');

    // Expanding an alt's row exercises the composite `${characterId}:${planetId}`
    // key and DOM ids end to end, not just that the row renders collapsed.
    await user.click(altRow);
    expect(altRow).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('leaves both yield columns blank for an extractor with no install-time baseline', async () => {
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // The fixture's pin has an expiry but no qty_per_cycle/cycle_time/
    // install_time, so Banked and Reset now are em-dashed — never a zero,
    // which would read as "this program has produced nothing" — and the
    // summary row's own product cell is a third dash, since this fixture has
    // no factory pins at all.
    expect(within(panel).getAllByText('—')).toHaveLength(3);
    expect(within(panel).queryByText('0 (0%)')).not.toBeInTheDocument();
  });

  it('shows banked yield, its share of the program, and the daily gain from resetting now', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(agedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('513,262 (27%)')).toBeInTheDocument();
    expect(within(panel).getByText('+793,859/day')).toBeInTheDocument();
    // Scoped to the drilldown region, not the whole row: the summary row's
    // own product cell reads "—" too, since this fixture has no factory
    // pins — this assertion is about the extraction card having no blanks,
    // not about the row.
    const region = within(panel).getByRole('region');
    expect(within(region).queryByText('—')).not.toBeInTheDocument();
  });

  it('flags a colony whose extractors are all past the efficient window as decayed', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // Five days in, a trailing day of output runs at ~24% of the program's
    // first day — under EFFICIENT_WINDOW_FRACTION — while expiry is still nine
    // days out, so this is neither idle nor expiring-soon.
    expect(within(panel).getByText('Decayed')).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
    expect(within(panel).queryByText('Idle')).not.toBeInTheDocument();
  });

  it('leaves a colony one day into its program healthy, not decayed', async () => {
    // The regression #316 exists for: on the old per-cycle read this colony
    // wore the badge four hours in, with 6% of a fortnight's output banked.
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(agedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Healthy')).toBeInTheDocument();
    expect(within(panel).queryByText('Decayed')).not.toBeInTheDocument();
  });

  it('titles the extraction card by its product, not by the extractor pin type', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(decayedDetailPayload)
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // "Extractor Control Unit" (the pin type) reads identically on every
    // extractor and identifies nothing; the resolved product is what
    // actually names the card, so it — not the pin type — is the heading.
    expect(within(panel).getByText('Felsic Magma').closest('h3')).toBeInTheDocument();
    expect(within(panel).getByText('Extractor Control Unit').closest('h3')).not.toBeInTheDocument();
  });

  it('groups factory pins into one Production row per schematic, with a facility count', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(roleCardsDetailPayload)
      ),
      http.get(`${ESI}/universe/schematics/${SCHEMATIC_ID}`, () =>
        HttpResponse.json({ schematic_name: 'Plasmoids', cycle_time: 1800 })
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    // Two Basic Industry Facility pins running the same schematic collapse
    // into one row, not two identical dashed rows.
    expect(within(panel).getByText('Plasmoids')).toBeInTheDocument();
    expect(within(panel).getByText('2 facilities running')).toBeInTheDocument();
  });

  it('lists infrastructure pins as chips, not dashed rows', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () =>
        HttpResponse.json(roleCardsDetailPayload)
      ),
      http.get(`${ESI}/universe/schematics/${SCHEMATIC_ID}`, () =>
        HttpResponse.json({ schematic_name: 'Plasmoids', cycle_time: 1800 })
      )
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Infrastructure')).toBeInTheDocument();
    expect(within(panel).getByText('Storage Facility')).toBeInTheDocument();
  });

  it('shows an unknown status rather than a confident Healthy when a colony detail failed to load', async () => {
    server.use(
      http.get(`${ESI}/characters/${CHAR_ID}/planets/${PLANET_ID}`, () => HttpResponse.error())
    );
    render(<App />);
    const panel = await colonyPanelFor(/Jita IV/);
    expect(within(panel).getByText('Unknown')).toBeInTheDocument();
    expect(within(panel).queryByText('Healthy')).not.toBeInTheDocument();
  });

  it("lists an alt's cached programs beside the active character's, without fetching for it", async () => {
    const ALT_ID = 92;
    const ALT_PLANET_ID = 40000002;
    const altPlanetsFetch = vi.fn();
    await addAlt(ALT_ID, 'Alt Two', [PLANETS_SCOPE]);
    // Cached on a previous visit to this page as that character. Page open
    // must read it, not re-fetch it.
    await db.esiCache.put({
      characterId: ALT_ID,
      key: 'planets',
      value: [{ ...planetsPayload[0], planet_id: ALT_PLANET_ID, owner_id: ALT_ID }],
      fetchedAt: Date.now(),
    });
    await db.esiCache.put({
      characterId: ALT_ID,
      key: `planet:${ALT_PLANET_ID}`,
      value: {
        links: [],
        routes: [],
        pins: [
          {
            pin_id: 9,
            type_id: 2848,
            latitude: 0,
            longitude: 0,
            expiry_time: new Date(BASE_NOW + 5 * DAY_MS).toISOString(),
            extractor_details: { heads: [{ head_id: 1, latitude: 0, longitude: 0 }] },
          },
        ],
      },
      fetchedAt: Date.now(),
    });
    server.use(
      http.get(`${ESI}/characters/${ALT_ID}/planets`, () => {
        altPlanetsFetch();
        return HttpResponse.json([]);
      })
    );

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show alt colonies/i }));

    // Grouped by character: the active Character's own group heading plus
    // the alt's, each above that character's colony rows. Scoped to the
    // colonies panel — "Pilot One" is also the active Character's own name
    // in the nav rail.
    const panel = coloniesPanel();
    expect(within(panel).getByText('Pilot One')).toBeInTheDocument();
    expect(within(panel).getByText('Alt Two')).toBeInTheDocument();
    expect(altPlanetsFetch).not.toHaveBeenCalled();
  });

  it('skips an alt without the planets scope: no ESI call, no re-auth banner', async () => {
    const SCOPELESS_ID = 93;
    const scopelessFetch = vi.fn();
    await addAlt(SCOPELESS_ID, 'Scopeless Alt', ['esi-skills.read_skills.v1']);
    server.use(
      http.get(`${ESI}/characters/${SCOPELESS_ID}/planets`, () => {
        scopelessFetch();
        return HttpResponse.json({ error: 'missing scope' }, { status: 403 });
      })
    );

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show alt colonies/i }));

    expect(scopelessFetch).not.toHaveBeenCalled();
    expect(screen.getByText(/Scopeless Alt/)).toHaveTextContent(/no planetary access/i);
    // The trap this guards: a live 403 on an alt raises the app-wide re-auth
    // banner, naming a character the player never asked about.
    expect(screen.queryByText('Log in again to see your colonies')).not.toBeInTheDocument();
  });

  it('keeps the colony view on the default tab, with no URL param needed', async () => {
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(screen.getByRole('tab', { name: 'Colonies' })).toHaveAttribute('aria-selected', 'true');
    expect(window.location.search).toBe('');
  });

  it('opens the planner on the Plan tab and records it in the URL', async () => {
    const user = userEvent.setup();
    render(<App />);
    await colonyPanelFor(/Jita IV/);

    await user.click(screen.getByRole('tab', { name: 'Plan' }));

    await screen.findByRole('heading', { name: 'Verdict' });
    expect(window.location.search).toContain('tab=plan');
    // The colony surface is a peer view, not a section below the planner.
    expect(screen.queryByRole('heading', { name: /Jita IV/ })).not.toBeInTheDocument();
  });

  it('restores the tab and the planned commodity from the URL alone', async () => {
    window.history.pushState({}, '', `/planetary-industry?tab=plan&type=${BROADCAST_NODE}`);
    render(<App />);

    await screen.findByRole('heading', { name: 'Verdict' });
    expect(screen.getByRole('tab', { name: 'Plan' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Product')).toHaveTextContent(BROADCAST_NODE_NAME);
  });

  it('plans the commodity the URL names, not the tier-4 default', async () => {
    // Broadcast Node, in the test above, is also `PlanPanel`'s own fallback
    // for an unrecognised `type`, so only a commodity that isn't the default
    // proves the param is read at all. This is the far end of the item
    // context menu's "PI Plan" link — the two must agree on `?tab=plan&type=`.
    window.history.pushState({}, '', `/planetary-industry?tab=plan&type=${TRANSMITTER}`);
    render(<App />);

    await screen.findByRole('heading', { name: 'Verdict' });
    expect(await screen.findByLabelText('Product')).toHaveTextContent(TRANSMITTER_NAME);
  });

  it('falls back to the colony view rather than crashing on a tab it does not know', async () => {
    window.history.pushState({}, '', '/planetary-industry?tab=nonsense&type=not-a-number');
    render(<App />);
    await colonyPanelFor(/Jita IV/);
    expect(screen.getByRole('tab', { name: 'Colonies' })).toHaveAttribute('aria-selected', 'true');
  });

  it('puts the verdict before the chain table, so the answer is not below the tree', async () => {
    window.history.pushState({}, '', '/planetary-industry?tab=plan');
    render(<App />);

    const verdict = await screen.findByRole('heading', { name: 'Verdict' });
    const chain = await screen.findByRole('heading', { name: 'Chain' });
    // DOM order, not a visual reorder: this is the mobile stacking order.
    expect(verdict.compareDocumentPosition(chain) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('reads an alt with nothing cached as "not loaded yet", never as having no colonies', async () => {
    await addAlt(92, 'Unread Alt', [PLANETS_SCOPE]);
    await addAlt(93, 'Empty Alt', [PLANETS_SCOPE]);
    await db.esiCache.put({ characterId: 93, key: 'planets', value: [], fetchedAt: Date.now() });

    render(<App />);
    await colonyPanelFor(/Jita IV/);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /show alt colonies/i }));

    const unread = screen.getByText(/Unread Alt/);
    const empty = screen.getByText(/Empty Alt/);
    expect(unread).not.toBe(empty);
    expect(unread).toHaveTextContent(/not loaded yet/i);
    expect(empty).toHaveTextContent(/No colonies/i);
  });
});
