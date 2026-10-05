/**
 * PI Plan, "Find the best thing to build", at laptop and phone widths.
 *
 * Only a real layout engine can say whether the cards, the Show me how panel
 * and the All products grid stay inside a 390px page and keep their 44px
 * targets. With `PI_SHOTS=<dir>` set, each state is also screenshot there, for
 * a side-by-side with `docs/design/pi-tabs/ref/`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { mockPlannerColonies, PLAN_WINS_COLONIES } from './support/piColonies';
import { mockHubPrices } from './support/piPrices';
import { CHARACTER_ID, CHARACTER_SKILLS } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1440, height: 900 };

async function assertNoOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    // On failure the offenders are the useful part of the message.
    const wide = [...document.querySelectorAll('main *')]
      .filter((el) => el.getBoundingClientRect().right > width + 0.5)
      .slice(0, 6)
      .map(
        (el) =>
          `${el.tagName} ${String(el.className).slice(0, 80)} "${el.textContent?.slice(0, 40)}"`
      );
    return { scrollWidth: document.documentElement.scrollWidth, clientWidth: width, wide };
  });
  expect(doc.scrollWidth, `overflowing: ${doc.wide.join(' | ')}`).toBeLessThanOrEqual(
    doc.clientWidth
  );
}

async function shot(page: Page, name: string): Promise<void> {
  const dir = process.env.PI_SHOTS;
  if (!dir) return;
  // A phone page runs thousands of pixels; the first screens are what compare.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.screenshot({
    path: `${dir}/${name}.png`,
    fullPage: true,
    clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: Math.min(height, 3200) },
  });
}

/** Command Center Upgrades IV and Interplanetary Consolidation III: a pilot who can host a setup. */
async function mockPiSkills(page: Page): Promise<void> {
  const trained = (skill_id: number, level: number) => ({
    skill_id,
    trained_skill_level: level,
    active_skill_level: level,
    skillpoints_in_skill: 100_000,
  });
  await page.route(`https://esi.evetech.net/characters/${CHARACTER_ID}/skills**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ...CHARACTER_SKILLS,
        skills: [...CHARACTER_SKILLS.skills, trained(2505, 4), trained(2495, 2)],
      }),
    })
  );
}

async function openFindBest(page: Page, withColonies: boolean): Promise<void> {
  await signInAndGoto(page, './planetary-industry/colonies');
  await mockPlannerColonies(page, withColonies ? PLAN_WINS_COLONIES : []);
  await mockHubPrices(page);
  await mockPiSkills(page);
  await page.goto('./planetary-industry/plan');
  if (withColonies) {
    await page.getByRole('button', { name: /^Find the best thing to build/ }).click();
  }
  await expect(page.getByRole('heading', { name: 'Best picks for you' })).toBeVisible({
    timeout: 20_000,
  });
}

for (const [label, viewport] of [
  ['phone', PHONE],
  ['desk', DESKTOP],
] as const) {
  test.describe(`PI Plan, find the best thing to build (${label})`, () => {
    test('no colonies: every type on, ranked cards, Show me how opens in place', async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await openFindBest(page, false);
      const types = page.getByRole('group', { name: 'Planet types' });
      await expect(types.getByRole('button', { pressed: true })).toHaveCount(8);
      await assertNoOverflow(page);
      await shot(page, `${label}-no-colonies`);

      const how = page.getByRole('button', { name: /Show me how/ }).first();
      if (label === 'phone') {
        expect((await how.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await how.click();
      const panel = page.locator('section[id^="find-how-"]');
      await expect(panel).toBeFocused();
      await expect(panel.getByRole('heading', { name: /Find a planet/ })).toBeVisible();
      await expect(panel.getByRole('heading', { name: /Build these/ })).toBeVisible();
      await expect(panel.getByRole('heading', { name: /Run it/ })).toBeVisible();
      await assertNoOverflow(page);
      if (label === 'phone') {
        for (const name of ['Close', 'Highsec only']) {
          const target = panel.getByRole(name === 'Close' ? 'button' : 'checkbox', { name });
          const box = (await target.boundingBox())!;
          // The checkbox's label row carries the 44px target, not the 16px box.
          const height =
            name === 'Close'
              ? box.height
              : (await target.locator('xpath=..').boundingBox())!.height;
          expect(height).toBeGreaterThanOrEqual(44);
        }
      }
      await shot(page, `${label}-show-me-how`);

      await page.getByRole('button', { name: 'Factory goods (P2)' }).click();
      await assertNoOverflow(page);
      await shot(page, `${label}-p2`);

      await page.getByRole('button', { name: 'All products' }).click();
      await expect(page.getByRole('region', { name: 'Advanced' })).toBeVisible();
      await assertNoOverflow(page);
      await shot(page, `${label}-all-products`);
    });

    test('with colonies: pre-marked types and what-if chips', async ({ page }) => {
      await page.setViewportSize(viewport);
      await openFindBest(page, true);
      await expect(page.getByRole('group', { name: 'Your planet types' })).toBeVisible();
      const chip = page.getByRole('button', { name: /^\+ / }).first();
      await chip.click();
      await expect(chip).toHaveAttribute('aria-pressed', 'true');
      await assertNoOverflow(page);
      await shot(page, `${label}-colonies-whatif`);
    });
  });
}
