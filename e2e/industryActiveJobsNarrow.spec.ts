/**
 * The Industry page's Active Jobs panel header at 390px (issue #1683).
 *
 * With jobs present the header carries the title, an "N running · N done"
 * summary with a next-finish line, the job-slot readout and the expand caret.
 * `Panel`'s left-hand group used to hold title and summary on one
 * non-wrapping row, and the title — the one element that said what the block
 * is — yielded first, clipping to "ACTIV…". `Panel`'s `wrapMeta` now drops the
 * summary to a second line below `md`, so the title keeps its full width.
 *
 * jsdom lays nothing out, so only a real browser can show the clip; the
 * assertion is the title's own `scrollWidth <= clientWidth`.
 *
 * Jobs are seeded by overriding the `industry/jobs` route the shared ESI mock
 * answers empty. Registered after `signInAndGoto`, so Playwright (last route
 * wins) consults it first.
 */
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';
import { CHARACTER_ID } from './support/fixtureData';

const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1280, height: 800 };

/** Rifter Blueprint, manufacturing, one running and one finished. */
const BLUEPRINT_TYPE_ID = 691;

function job(id: number, status: 'active' | 'ready', endOffsetMs: number) {
  const now = Date.now();
  return {
    job_id: id,
    activity_id: 1,
    blueprint_type_id: BLUEPRINT_TYPE_ID,
    facility_id: 60003760,
    station_id: 60003760,
    runs: 1,
    start_date: new Date(now - 3_600_000).toISOString(),
    end_date: new Date(now + endOffsetMs).toISOString(),
    status,
    cost: 1000,
    product_type_id: 587,
  };
}

test.describe('Jobs panel header', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndGoto(page);
    await page.route(
      (url) => url.pathname === `/characters/${CHARACTER_ID}/industry/jobs`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([job(1, 'active', 7_200_000), job(2, 'ready', -60_000)]),
        })
    );
  });

  async function titleClip(page: import('@playwright/test').Page) {
    const heading = page.getByRole('heading', { name: 'Jobs', exact: true });
    await expect(heading).toBeVisible();
    return heading.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));
  }

  test('title is not clipped at 390px, collapsed or expanded', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/jobs');

    const caret = page.getByRole('button', { name: 'Show job list' });
    await expect(caret).toBeVisible();
    await expect(page.getByText(/1 running · 1 done/)).toBeVisible();

    const collapsed = await titleClip(page);
    expect(collapsed.scrollWidth).toBeLessThanOrEqual(collapsed.clientWidth);

    const box = await caret.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(36);
    expect(box!.width).toBeGreaterThanOrEqual(36);
    await expect(
      page
        .locator('section', { has: page.getByRole('heading', { name: 'Jobs' }) })
        .locator('header [tabindex="0"]')
    ).toBeVisible();

    await caret.click();
    await expect(page.getByRole('button', { name: 'Hide job list' })).toBeVisible();
    const expanded = await titleClip(page);
    expect(expanded.scrollWidth).toBeLessThanOrEqual(expanded.clientWidth);
  });

  test('summary sits under the title on a phone and beside it from md up', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/jobs');
    const heading = page.getByRole('heading', { name: 'Jobs', exact: true });
    const summary = page.getByText(/1 running · 1 done/);
    await expect(summary).toBeVisible();
    const phoneTitle = (await heading.boundingBox())!;
    const phoneSummary = (await summary.boundingBox())!;
    expect(phoneSummary.y).toBeGreaterThanOrEqual(phoneTitle.y + phoneTitle.height - 1);

    await page.setViewportSize(DESKTOP);
    const deskTitle = (await heading.boundingBox())!;
    const deskSummary = (await summary.boundingBox())!;
    expect(deskSummary.y).toBeLessThan(deskTitle.y + deskTitle.height);
  });
});

test.describe('Active Jobs phone card (#3684)', () => {
  test.beforeEach(async ({ page }) => {
    await signInAndGoto(page);
    await page.route(
      (url) => url.pathname === `/characters/${CHARACTER_ID}/industry/jobs`,
      (route) =>
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            job(1, 'active', 7_200_000),
            job(2, 'ready', -60_000),
            job(3, 'active', 1_800_000),
          ]),
        })
    );
  });

  test('each job is a compact card with its countdown, bar and 36px Log production', async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./industry/jobs');
    await page.getByRole('button', { name: 'Show job list' }).click();

    const rows = page.getByRole('table').locator('tbody tr');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      const box = (await rows.nth(i).boundingBox())!;
      // Today's labelled card is ~150px; the dense card is two or three lines.
      expect(box.height).toBeLessThan(110);
    }

    // Sorted soonest-first, so locate rows by content rather than index.
    const logButton = page.getByRole('button', { name: 'Log production…' });
    const doneRow = rows.filter({ has: logButton });
    const runningRow = rows.filter({ hasNot: logButton }).first();

    const endsIn = runningRow.locator('td[data-label="Ends in"]');
    await expect(endsIn).toBeVisible();
    const title = (await runningRow.locator('td').first().boundingBox())!;
    const corner = (await endsIn.boundingBox())!;
    expect(corner.y).toBeLessThan(title.y + title.height);

    await expect(runningRow.getByRole('progressbar')).toBeVisible();
    await expect(runningRow.locator('td[data-label="Ends (EVE)"]')).toBeHidden();

    const log = doneRow.getByRole('button', { name: 'Log production…' });
    await expect(log).toBeVisible();
    expect((await log.boundingBox())!.height).toBeGreaterThanOrEqual(36);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('desktop keeps the table columns', async ({ page }) => {
    await page.setViewportSize(DESKTOP);
    await page.goto('./industry/jobs');
    await page.getByRole('button', { name: 'Show job list' }).click();
    await expect(page.getByRole('columnheader', { name: 'Ends (EVE)' })).toBeVisible();
  });
});
