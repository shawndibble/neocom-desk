/**
 * The officer SRP Queue's Pending table fits its panel from 1024 up (#5701):
 * no sideways scroll and Reject fully inside the panel. Lost and Fleet or FC
 * start off in the table's column picker to make the room.
 *
 * Dev server only: the page reads its claims from the Storybook stand-ins
 * (`srpBackendOverride.ts` + `srpOfficerBackendOverride.ts` and their
 * fixtures), installed by importing those `/src` modules into the running app
 * — the e2e build has no Firebase.
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID, CORPORATION_ID, SCOPES } from './support/fixtureData';
import { scopesForGroup } from '../src/esi/scopes';
import type { setSrpBackendOverride } from '../src/features/corp/srpBackendOverride';
import type { setSrpOfficerBackendOverride } from '../src/features/corp/srpOfficerBackendOverride';
import type { createSrpFixture } from '../src/storybook/srpFixture';
import type { createSrpOfficerFixture } from '../src/storybook/srpOfficerFixture';
import type { db } from '../src/db';

async function openQueue(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (path === `/characters/${CHARACTER_ID}/roles`) return json({ roles: ['Director'] });
    if (path === `/corporations/${CORPORATION_ID}/`)
      return json({ name: 'Sample Corp', ceo_id: 1, member_count: 40, tax_rate: 0.1 });
    if (path.startsWith(`/corporations/${CORPORATION_ID}/`)) return json([]);
    await route.fallback();
  });
  await signInAndGoto(page, './settings', [...SCOPES, ...scopesForGroup('corp')]);
  await expect(page.locator('main')).toBeVisible();
  const seeded = await page.evaluate(
    async ({ characterId, corporationId }) => {
      // Indirected through variables so `tsc` leaves them alone: dev-server URLs,
      // not paths this spec's module graph resolves. The casts are checked
      // against the real signatures.
      const urls = {
        db: '/src/db/index.ts',
        srp: '/src/features/corp/srpBackendOverride.ts',
        officer: '/src/features/corp/srpOfficerBackendOverride.ts',
        srpFixture: '/src/storybook/srpFixture.ts',
        officerFixture: '/src/storybook/srpOfficerFixture.ts',
      };
      const srp = (await import(/* @vite-ignore */ urls.srp)) as {
        setSrpBackendOverride: typeof setSrpBackendOverride;
      };
      const officer = (await import(/* @vite-ignore */ urls.officer)) as {
        setSrpOfficerBackendOverride: typeof setSrpOfficerBackendOverride;
      };
      const srpFixture = (await import(/* @vite-ignore */ urls.srpFixture)) as {
        createSrpFixture: typeof createSrpFixture;
      };
      const officerFixture = (await import(/* @vite-ignore */ urls.officerFixture)) as {
        createSrpOfficerFixture: typeof createSrpOfficerFixture;
      };
      // The queue reads for the active pilot's corporation, as the story's seed sets it.
      const store = (await import(/* @vite-ignore */ urls.db)) as { db: typeof db };
      const updated = await store.db.characters.update(characterId, { corporationId });
      // The fixture speaks for the Storybook sample corp; this pilot is in another.
      const backend = srpFixture.createSrpFixture('director', 'configured');
      const verify = backend.verify;
      srp.setSrpBackendOverride({ ...backend, verify: () => ({ ...verify(), corporationId }) });
      officer.setSrpOfficerBackendOverride(officerFixture.createSrpOfficerFixture('queue'));
      window.history.pushState(null, '', '/corp/srp/queue');
      window.dispatchEvent(new PopStateEvent('popstate'));
      return updated;
    },
    { characterId: CHARACTER_ID, corporationId: CORPORATION_ID }
  );
  expect(seeded, 'pilot row seeded with a corporation').toBe(1);
}

/** Fit metrics of the table's own sideways scroller: its nearest ancestor that scrolls on x. */
const scrollerFit = (table: Locator) =>
  table.evaluate((el) => {
    let node = el.parentElement;
    while (node && !/auto|scroll/.test(getComputedStyle(node).overflowX)) {
      node = node.parentElement;
    }
    if (!node) return null;
    return {
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      right: node.getBoundingClientRect().right,
    };
  });

for (const width of [1024, 1280]) {
  test(`SRP Queue Pending table fits its panel at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openQueue(page);
    const table = page.locator('main table').first();
    const row = table.locator('tbody tr', { hasText: 'Varro Kestane' }).first();
    // Measured once the hull and system names have loaded, at their real widths.
    await expect(row).toContainText('Gila');
    await expect(row).toContainText('Tama');

    const fit = await scrollerFit(table);
    expect(fit, 'no sideways scroller around the table').not.toBeNull();
    expect(fit!.scrollWidth, 'table scrolls sideways').toBeLessThanOrEqual(fit!.clientWidth);

    const rejectBox = await row.getByRole('button', { name: 'Reject' }).boundingBox();
    expect(rejectBox).not.toBeNull();
    expect(rejectBox!.x + rejectBox!.width).toBeLessThanOrEqual(fit!.right);

    if (width !== 1024) return;
    // A row with no amount to type stays one line per cell, the pilot's name unbroken.
    const name = row.getByText('Varro Kestane', { exact: true });
    const lineHeight = await name.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
    expect((await name.boundingBox())!.height, 'pilot name on one line').toBeLessThan(
      lineHeight * 1.5
    );
    for (const tr of await table.locator('tbody tr').all()) {
      if ((await tr.getByRole('textbox').count()) > 0) continue;
      expect((await tr.boundingBox())!.height, await tr.innerText()).toBeLessThan(56);
    }
  });
}
