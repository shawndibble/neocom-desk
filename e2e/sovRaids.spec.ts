/**
 * The Skyhook raids widget (issue #4798) on the Overview: added from the
 * Gallery, one row per raidable skyhook in the alliance's own space (another
 * alliance's never shows), no horizontal scroll at any width, and a row that
 * opens its facts in a modal with the jump count linking to Route Safety.
 *
 * The fixture pilot is already in Test Alliance (99000001) and `mockEsi.ts`
 * names it, so only the public sov reads and the planets are served here.
 */
import type { Page } from '@playwright/test';
import { test, expect, PHONE } from './support/testBase';
import { ALLIANCE_ID } from './support/fixtureData';
import { overviewLayoutSetting, signInAndGoto } from './support/authSeed';
import { overflow } from './support/corpBoard';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString();
const OTHER_ALLIANCE = 12345;

const SKYHOOKS = [
  {
    planet: 40100001,
    name: 'X-7OMU IV',
    system: 30001978,
    alliance: ALLIANCE_ID,
    start: -HOUR,
    end: HOUR + 20 * MINUTE,
  },
  {
    planet: 40100002,
    name: 'Efa II',
    system: 30003892,
    alliance: ALLIANCE_ID,
    start: HOUR + 40 * MINUTE,
    end: 5 * HOUR + 40 * MINUTE,
  },
  {
    planet: 40100003,
    name: '4-HWWF VII',
    system: 30000240,
    alliance: OTHER_ALLIANCE,
    start: 30 * MINUTE,
    end: 4 * HOUR + 30 * MINUTE,
  },
];

async function mockSovRaids(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === '/sovereignty/systems') {
      return json({
        solar_systems: SKYHOOKS.map((s) => ({
          solar_system_id: s.system,
          claim: {
            alliance: {
              alliance_id: s.alliance,
              corporation_id: 1,
              claimed_since: iso(-400 * 24 * HOUR),
              is_capital_system: false,
            },
          },
        })),
      });
    }
    if (path === '/skyhooks/raidable') {
      return json({
        skyhooks: SKYHOOKS.map((s) => ({
          solar_system_id: s.system,
          planet_id: s.planet,
          theft_vulnerability: { start: iso(s.start), end: iso(s.end) },
        })),
      });
    }
    const planet = SKYHOOKS.find((s) => path === `/universe/planets/${s.planet}`);
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

test.describe('Skyhook raids widget', () => {
  test('lists our raidable skyhooks, fits every width, and opens a row in a modal', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockSovRaids(page);
    await signInAndGoto(page, './overview', undefined, [
      overviewLayoutSetting([{ kind: 'training', size: 'S' }]),
    ]);
    // The first load on a cold dev server is slow.
    await expect(page.getByRole('region', { name: 'Training', exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.locator('main').getByRole('button', { name: 'Customize' }).click();
    await page.getByRole('button', { name: /^Add widget$/ }).click();
    const gallery = page.getByRole('dialog', { name: 'Add a widget' });
    await gallery.getByRole('button', { name: 'Add Skyhook raids' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Done' }).click();

    const widget = page.getByRole('region', { name: 'Skyhook raids', exact: true });
    await widget.scrollIntoViewIfNeeded();
    await expect(widget).toBeVisible();
    await expect(widget.getByRole('button', { name: 'X-7OMU IV' })).toBeVisible();
    await expect(widget.getByRole('button', { name: 'Efa II' })).toBeVisible();
    await expect(widget).toContainText('2skyhooks raidable in our space');
    // Another alliance's skyhook is raidable too, but not ours to defend.
    await expect(widget.getByText('4-HWWF VII')).toHaveCount(0);

    for (const width of [390, 768, 1024, 1280, 1440, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const { scrollWidth, clientWidth, offenders } = await overflow(page);
      expect(
        scrollWidth,
        `${width}px: page is ${scrollWidth}px wide in ${clientWidth}px. Widest: ${offenders.join(', ')}`
      ).toBeLessThanOrEqual(clientWidth);
      await widget.screenshot({ path: testInfo.outputPath(`widget-${width}.png`) });
    }

    await page.setViewportSize({ width: 1440, height: 900 });
    await widget.getByRole('button', { name: 'X-7OMU IV' }).click();
    const modal = page.getByRole('dialog', { name: 'X-7OMU IV' });
    await expect(modal).toContainText('Test Alliance');
    await expect(modal.getByRole('link', { name: /route safety to X-7OMU/i })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('modal-1440.png') });

    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await page.setViewportSize(PHONE);
    await widget.getByRole('button', { name: 'Efa II' }).click();
    await expect(page.getByRole('dialog', { name: 'Efa II' })).toContainText('Test Alliance');
    await page.screenshot({ path: testInfo.outputPath('modal-390.png') });
  });
});
