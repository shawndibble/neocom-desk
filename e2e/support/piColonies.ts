/**
 * A small PI operation for the signed-in fixture Character: four colonies
 * across a highsec and a nullsec system, each with a measured extractor
 * program and one link to its Launchpad, so the Goal Planner has real rates,
 * real budgets and a measured link cost to fit against.
 *
 * Planet ids are real ones carried by `public/data/pi-planet-radius.json`, so
 * the link cost is priced from the shipped radius rather than borrowed. Names,
 * systems and security are this fixture's own (mocked below).
 */
import type { Page } from '@playwright/test';
import { CHARACTER_ID } from './fixtureData';

const HIGHSEC_SYSTEM = 30000142;
const NULLSEC_SYSTEM = 30000001;

interface Colony {
  planetId: number;
  systemId: number;
  name: string;
  type: string;
  level: number;
  /** P0 typeIds, one ECU each. */
  extracts: number[];
  heads: number;
  /** Hours until the programs expire; negative is already stopped. Default 52. */
  expiresInHours?: number;
  /** Hours since the programs were installed. Default 20. */
  installedHoursAgo?: number;
  /** Basic factories set to a schematic nothing feeds, so they sit idle. */
  idleBasics?: number;
  /** P0 per cycle per ECU. Default 6,000 (+500 per extra ECU); a big one fills storage fast. */
  qtyPerCycle?: number;
}

/** Per-planet overrides a spec layers over `COLONIES`; the defaults stay what the planner specs rely on. */
export type ColonyVariants = Record<number, Partial<Colony>>;

const COLONIES: Colony[] = [
  {
    planetId: 40009077,
    systemId: HIGHSEC_SYSTEM,
    name: 'Jita I',
    type: 'barren',
    level: 4,
    extracts: [2267, 2267],
    heads: 8,
  },
  {
    planetId: 40009080,
    systemId: HIGHSEC_SYSTEM,
    name: 'Jita IV',
    type: 'temperate',
    level: 4,
    extracts: [2268],
    heads: 9,
  },
  {
    planetId: 40009082,
    systemId: HIGHSEC_SYSTEM,
    name: 'Jita V',
    type: 'gas',
    level: 5,
    extracts: [2309, 2310],
    heads: 7,
  },
  {
    planetId: 40000005,
    systemId: NULLSEC_SYSTEM,
    name: 'X-7OMU III',
    type: 'oceanic',
    level: 3,
    extracts: [],
    heads: 0,
  },
];

const HOUR = 3_600_000;

/** P0 typeId to the basic schematic that refines it on the spot. */
const BASIC_SCHEMATIC: Record<number, number> = { 2267: 126, 2268: 121, 2309: 123, 2310: 124 };

function detailFor(colony: Colony, now: number) {
  const installedHoursAgo = colony.installedHoursAgo ?? 20;
  const expiresInHours = colony.expiresInHours ?? 52;
  const pins: unknown[] = colony.extracts.map((product, i) => ({
    pin_id: 100 + i,
    type_id: 2848,
    latitude: 0.3 + i * 0.05,
    longitude: 1.1 + i * 0.07,
    install_time: new Date(now - installedHoursAgo * HOUR).toISOString(),
    expiry_time: new Date(now + expiresInHours * HOUR).toISOString(),
    extractor_details: {
      heads: Array.from({ length: colony.heads }, (_, h) => ({
        head_id: h,
        latitude: 0.3,
        longitude: 1.1,
      })),
      product_type_id: product,
      qty_per_cycle: (colony.qtyPerCycle ?? 6_000) + i * 500,
      cycle_time: 1800,
    },
  }));
  pins.push({ pin_id: 1, type_id: 2256, latitude: 0.4, longitude: 1.4 });
  // Each ECU's P0 refined on the spot, as a real colony runs it: two Basic
  // Industry Facilities per program (~12,000 P0/h against 6,000 each).
  const basics = colony.extracts.flatMap((product, i) =>
    [0, 1].map((j) => ({
      pin_id: 200 + i * 2 + j,
      type_id: 2469,
      latitude: 0.42 + i * 0.03,
      longitude: 1.45 + j * 0.03,
      schematic_id: BASIC_SCHEMATIC[product],
    }))
  );
  pins.push(...basics);
  for (let k = 0; k < (colony.idleBasics ?? 0); k += 1) {
    basics.push({
      pin_id: 300 + k,
      type_id: 2469,
      latitude: 0.5 + k * 0.03,
      longitude: 1.5,
      // Electrolytes needs Ionic Solutions, which no colony here extracts.
      schematic_id: 123,
    });
    pins.push(basics[basics.length - 1]);
  }
  // A tree rooted at the Launchpad: every ECU and every basic one hop from it.
  const links = [...colony.extracts.map((_, i) => 100 + i), ...basics.map((b) => b.pin_id)].map(
    (pinId) => ({ source_pin_id: 1, destination_pin_id: pinId, link_level: 0 })
  );
  if (links.length === 0) {
    pins.push({ pin_id: 2, type_id: 2257, latitude: 0.45, longitude: 1.6 });
    links.push({ source_pin_id: 1, destination_pin_id: 2, link_level: 0 });
  }
  return { pins, links, routes: [] };
}

/** Routes the active Character's colony reads, and the public lookups they pull. */
export async function mockPlannerColonies(
  page: Page,
  variants: ColonyVariants = {}
): Promise<void> {
  const now = Date.now();
  const colonies = COLONIES.map((colony) => ({ ...colony, ...variants[colony.planetId] }));
  const json = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
  await page.route(`https://esi.evetech.net/characters/${CHARACTER_ID}/planets**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    const match = path.match(/\/planets\/(\d+)\/?$/);
    if (match) {
      const colony = colonies.find((c) => c.planetId === Number(match[1]));
      return route.fulfill(colony ? json(detailFor(colony, now)) : { status: 404, body: '{}' });
    }
    return route.fulfill(
      json(
        colonies.map((c) => ({
          solar_system_id: c.systemId,
          planet_id: c.planetId,
          planet_type: c.type,
          owner_id: CHARACTER_ID,
          last_update: new Date(now - HOUR).toISOString(),
          upgrade_level: c.level,
          num_pins: c.extracts.length + 1,
        }))
      )
    );
  });
  // The Colonies tab names each basic's schematic.
  await page.route('https://esi.evetech.net/universe/schematics/**', (route) => {
    const id = Number(new URL(route.request().url()).pathname.match(/schematics\/(\d+)/)?.[1]);
    const names: Record<number, string> = {
      126: 'Reactive Metals',
      121: 'Water',
      123: 'Electrolytes',
      124: 'Oxygen',
    };
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ cycle_time: 1800, schematic_name: names[id] ?? `Schematic ${id}` }),
    });
  });
  await page.route('https://esi.evetech.net/universe/planets/**', (route) => {
    const id = Number(new URL(route.request().url()).pathname.match(/planets\/(\d+)/)?.[1]);
    const colony = colonies.find((c) => c.planetId === id);
    return route.fulfill(
      json({
        planet_id: id,
        name: colony?.name ?? `Planet ${id}`,
        system_id: colony?.systemId ?? HIGHSEC_SYSTEM,
        type_id: 11,
        position: { x: 0, y: 0, z: 0 },
      })
    );
  });
  await page.route('https://esi.evetech.net/universe/systems/**', (route) => {
    const id = Number(new URL(route.request().url()).pathname.match(/systems\/(\d+)/)?.[1]);
    return route.fulfill(
      json({
        system_id: id,
        name: id === NULLSEC_SYSTEM ? 'X-7OMU' : 'Jita',
        security_status: id === NULLSEC_SYSTEM ? -0.35 : 0.95,
        constellation_id: 20000020,
        star_id: 40009076,
      })
    );
  });
}
