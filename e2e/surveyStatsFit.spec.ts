/**
 * The Survey's stat tiles on the public share page (`/s/<id>`): no tile value
 * clips or ellipsizes, at the widths where the page's ~720px board used to
 * squeeze five viewport-keyed columns to ~110px each (#3280). The tile grid
 * follows the board's own width, so a tile drops to another row instead.
 *
 * Playwright rather than jsdom: the check is real layout (`scrollWidth` vs
 * `clientWidth`). No login; Firestore's reads are mocked, as in
 * `appraisalSharedNarrow.spec.ts`.
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';

const SHARE_ID = 'e2eSurvy1';

/** Two scans of one field ten minutes apart, so Pace, Done and Time left all have a value. */
const SCANS = [
  { at: -600_000, text: 'Veldspar\t1,000,000\t200,000 m3\t900,000.00 ISK\t23 km' },
  { at: 0, text: 'Veldspar\t794,000\t158,800 m3\t720,000.00 ISK\t23 km' },
];

function toStamp(offsetMs: number): string {
  return new Date(Date.now() - 60_000 + offsetMs).toISOString();
}

async function mockSurvey(page: Page): Promise<void> {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
  await page.route(/firestore\.googleapis\.com\/.*documents:batchGet/, async (route) => {
    const request = route.request().postDataJSON() as { documents: string[] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          found: {
            name: request.documents[0],
            fields: {
              type: { stringValue: 'survey' },
              payload: {
                mapValue: {
                  fields: { v: { integerValue: '1' }, owner: { stringValue: 'Test Pilot' } },
                },
              },
              createdAt: { timestampValue: now },
              expiresAt: { timestampValue: expiresAt },
            },
            createTime: now,
            updateTime: now,
          },
          readTime: now,
        },
      ]),
    });
  });
  await page.route(/firestore\.googleapis\.com\/.*:runQuery/, async (route) => {
    const body = route.request().postDataJSON() as {
      structuredQuery?: { from?: { collectionId?: string }[] };
    };
    const scans = body.structuredQuery?.from?.[0]?.collectionId === 'surveyScans';
    const parent = new URL(route.request().url()).pathname
      .replace(/^\/v1\//, '')
      .split(':runQuery')[0];
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        scans
          ? SCANS.map((scan, i) => ({
              document: {
                name: `${parent}/surveyScans/scan${i}`,
                fields: {
                  text: { stringValue: scan.text },
                  createdAt: { timestampValue: toStamp(scan.at) },
                  expiresAt: { timestampValue: expiresAt },
                },
                createTime: now,
                updateTime: now,
              },
              readTime: now,
            }))
          : [{ readTime: now }]
      ),
    });
  });
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`survey stat tiles never clip at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockSurvey(page);
    await page.goto(`./s/${SHARE_ID}`);
    const tiles = page.locator('[data-survey-stat]');
    await expect(tiles.first()).toBeVisible({ timeout: 15_000 });
    expect(await tiles.count()).toBeGreaterThanOrEqual(5);

    const measured = await tiles.evaluateAll((nodes) =>
      nodes.map((node) => {
        const el = node as HTMLElement;
        return {
          text: el.textContent ?? '',
          clipped: el.scrollWidth > el.clientWidth,
          overflow: getComputedStyle(el).textOverflow,
        };
      })
    );
    // Rows are even: one row of 6, or two rows of 3 (never 4 + 2 or 5 + 1).
    const rows = await tiles.evaluateAll((nodes) => {
      const counts = new Map<number, number>();
      for (const node of nodes) {
        const top = Math.round(node.getBoundingClientRect().top);
        counts.set(top, (counts.get(top) ?? 0) + 1);
      }
      return [...counts.values()];
    });
    expect(rows.every((count) => count === rows[0])).toBe(true);
    expect([3, 6]).toContain(rows[0]);
    for (const tile of measured) {
      expect(tile.clipped, tile.text).toBe(false);
      expect(tile.overflow, tile.text).not.toBe('ellipsis');
      expect(tile.text, tile.text).not.toContain('…');
    }
  });
}
