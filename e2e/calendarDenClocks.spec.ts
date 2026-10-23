/**
 * Mercenary Den clocks on the Calendar (issue #4806): a reinforced den and an
 * open operation land on the Coming Up rail, the map draws each kind as its
 * own glyph, and the filter menu is the legend (glyph, name, count).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { CHARACTER_ID } from './support/fixtureData';
import { signInAndGoto } from './support/authSeed';

const HOUR = 3_600_000;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();

async function mockDens(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    const me = `/characters/${CHARACTER_ID}`;
    if (path === `${me}/structures/mercenary-dens`) {
      return json({ mercenary_dens: [{ id: 1, planet_id: 40009077 }] });
    }
    if (path === `${me}/structures/mercenary-dens/1`) {
      return json({
        id: 1,
        type_id: 85230,
        state: 'Paused',
        infomorphs: { amount: 184 },
        evolution: {
          development: { amount: 74, level: 'Level3' },
          anarchy: { amount: 62, level: 'Level1' },
        },
        reinforcement_timer: { end: iso(14 * HOUR) },
        skyhook: { id: 901, planet_id: 40009077, corporation_id: 98000001 },
      });
    }
    if (path === `${me}/mercenary-tactical-operations`) {
      return json({ operations: [{ id: 'op-1', mercenary_den_id: 1 }] });
    }
    if (path === `${me}/mercenary-tactical-operations/op-1`) {
      return json({
        id: 'op-1',
        mercenary_den_id: 1,
        state: 'Available',
        dungeon_type_id: 1,
        expires: iso(30 * HOUR),
      });
    }
    if (path === '/universe/planets/40009077') {
      return json({
        planet_id: 40009077,
        name: 'Jita IV',
        system_id: 30000142,
        type_id: 11,
        position: { x: 0, y: 0, z: 0 },
      });
    }
    return route.fallback();
  });
}

test('den clocks land on the rail and the map, and the filter menu names the kind', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockDens(page);
  await signInAndGoto(page, './calendar');

  await expect(page.getByText('leaves reinforcement').first()).toBeVisible();
  await expect(page.getByText('operation expires').first()).toBeVisible();
  await expect(page.getByText('Jita IV').first()).toBeVisible();
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/calendar-1440.png` });
  }

  await page
    .getByRole('button', { name: /filter/i })
    .first()
    .click();
  const den = page.getByRole('menuitemcheckbox', { name: /Mercenary dens/ });
  await expect(den).toContainText('2');
  await expect(den.locator('svg')).toHaveCount(1);
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/calendar-filter-1440.png` });
  }
});

test('den clocks show on the phone rail too', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockDens(page);
  await signInAndGoto(page, './calendar');
  await expect(page.getByText('leaves reinforcement').first()).toBeVisible();
  if (process.env.SHOT_DIR) {
    await page.screenshot({ path: `${process.env.SHOT_DIR}/calendar-390.png` });
  }
});
