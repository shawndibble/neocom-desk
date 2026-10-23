/**
 * The Mercenary Dens widget (issue #4791) at every width: its table keeps the
 * columns that fit its own box, so neither the table nor the page ever
 * scrolls sideways. Four dens with long-ish cell text across two states.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import { overviewLayoutSetting, signInAndGoto } from './support/authSeed';
import { expectNoPageOverflow } from './support/overflow';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

const DENS = [
  { id: 1, planet: 40009077, name: 'Jita IV', system: 30000142, state: 'Paused', rf: 14 * HOUR },
  { id: 2, planet: 40009087, name: 'Perimeter VII', system: 30000144, state: 'Running' },
  { id: 3, planet: 40009081, name: 'Jita VIII', system: 30000142, state: 'Running', anarchy: 2 },
  { id: 4, planet: 40009085, name: 'Perimeter II', system: 30000144, state: 'Disabled' },
];

async function mockDens(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const me = `/characters/${CHARACTER_ID}`;
    if (path === `${me}/structures/mercenary-dens`) {
      return json({ mercenary_dens: DENS.map((d) => ({ id: d.id, planet_id: d.planet })) });
    }
    const den = DENS.find((d) => path === `${me}/structures/mercenary-dens/${d.id}`);
    if (den) {
      return json({
        id: den.id,
        type_id: 85230,
        state: den.state,
        infomorphs: { amount: 184 * den.id },
        evolution: {
          development: { amount: 74, level: 'Level3' },
          anarchy: { amount: 62, level: `Level${den.anarchy ?? 1}` },
        },
        ...(den.rf ? { reinforcement_timer: { end: iso(den.rf) } } : {}),
        skyhook: { id: 900 + den.id, planet_id: den.planet, corporation_id: 98000001 },
      });
    }
    if (path === `${me}/mercenary-tactical-operations`) {
      return json({
        operations: [
          { id: 'op-1', mercenary_den_id: 2 },
          { id: 'op-2', mercenary_den_id: 2 },
        ],
      });
    }
    const op = /\/mercenary-tactical-operations\/(op-\d)$/.exec(path)?.[1];
    if (op) {
      return json({
        id: op,
        mercenary_den_id: 2,
        state: 'Available',
        dungeon_type_id: 1,
        expires: iso(op === 'op-1' ? 9 * HOUR : 30 * HOUR),
      });
    }
    const planet = DENS.find((d) => path === `/universe/planets/${d.planet}`);
    if (planet) {
      return json({
        planet_id: planet.planet,
        name: planet.name,
        system_id: planet.system,
        type_id: 11,
        position: { x: 0, y: 0, z: 0 },
      });
    }
    return route.fallback();
  });
}

for (const width of [390, 768, 1024, 1440, 1920]) {
  test(`the dens table fits its box at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await mockDens(page);
    await signInAndGoto(page, './overview', undefined, [
      overviewLayoutSetting([
        { kind: 'mercenaryDens', size: 'L', view: 'table' },
        { kind: 'mercenaryDens', size: 'M', view: 'table' },
        { kind: 'mercenaryDens', size: 'S', view: 'table' },
        { kind: 'mercenaryDens', size: 'F', view: 'table' },
      ]),
    ]);
    const tables = page.getByRole('table', { name: 'Mercenary dens' });
    await expect(tables.first()).toBeVisible();
    await expect(tables.first().getByText('Jita IV')).toBeVisible();
    for (const table of await tables.all()) {
      const overflow = () =>
        table.evaluate((el) => el.parentElement!.scrollWidth - el.parentElement!.clientWidth);
      await expect.poll(overflow).toBeLessThanOrEqual(0);
    }
    await expectNoPageOverflow(page);
    if (process.env.SHOT_DIR) {
      await page.screenshot({ path: `${process.env.SHOT_DIR}/dens-${width}.png`, fullPage: true });
    }
  });
}
