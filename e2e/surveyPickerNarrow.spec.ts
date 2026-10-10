/**
 * The Survey tab's "Your surveys" switcher at 390px: the open list is clamped
 * to the viewport and wraps long ore names, so each row's mined percent, time
 * and 44px remove button stay on screen (#3282).
 *
 * Playwright rather than jsdom: the `max-md:` clamp and the wrapping are CSS a
 * real engine has to evaluate. Firestore reads are mocked (the e2e build
 * carries a placeholder project id and no API key — see
 * `appraisalSharedNarrow.spec.ts`).
 */
import type { Page } from '@playwright/test';
import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

const PHONE = { width: 390, height: 844 };

const IDS = ['abc123XYZ', 'def456UVW'];
const ORE = 'Dark Ochre Of Extraordinary Lengt';
const SCAN = `${ORE}\t25\t25,000 m3\t5,120,000.00 ISK\t28 km\n${ORE}\t55\t55,000 m3\t11,300,000.00 ISK\t10 km`;

async function mockSurveys(page: Page): Promise<void> {
  await page.route(/firestore\.googleapis\.com\/.*documents:batchGet/, async (route) => {
    const request = route.request().postDataJSON() as { documents: string[] };
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000).toISOString();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          found: {
            name: request.documents[0],
            fields: {
              type: { stringValue: 'survey' },
              payload: { mapValue: { fields: {} } },
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
    const now = new Date().toISOString();
    const isScans = route.request().url().includes('/shares/');
    const body = route.request().postData() ?? '';
    const wantsScans = isScans && body.includes('surveyScans');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        wantsScans
          ? [
              {
                document: {
                  name: `projects/neocom-e2e/databases/(default)/documents/shares/x/surveyScans/s1`,
                  fields: {
                    text: { stringValue: SCAN },
                    createdAt: { timestampValue: now },
                  },
                  createTime: now,
                  updateTime: now,
                },
                readTime: now,
              },
            ]
          : [{ readTime: now }]
      ),
    });
  });
}

test('the open survey list fits a phone and keeps the remove button on screen', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  await mockSurveys(page);
  await signInAndGoto(page, `./mining/survey?survey=${IDS[0]}`);
  const picker = page.getByRole('combobox', { name: 'Your surveys' });
  await expect(page.getByRole('heading', { name: 'Mining Survey' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(picker).toHaveCount(0);
  // Give the first survey time to be noted before leaving it.
  await page.waitForTimeout(500);
  await page.goto(`./mining/survey?survey=${IDS[1]}`);
  await expect(picker).toBeVisible({ timeout: 15_000 });

  await picker.click();
  const list = page.getByRole('listbox');
  await expect(list).toBeVisible();
  // The remove buttons are pointer-only (aria-hidden, Delete key for keyboards), so no role query.
  const removes = list.locator('button[aria-label^="Remove"]');
  await expect(removes).toHaveCount(2);

  const box = await list.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right };
  });
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(PHONE.width);
  for (let i = 0; i < 2; i++) {
    const r = await removes.nth(i).evaluate((el) => el.getBoundingClientRect().right);
    expect(r).toBeLessThanOrEqual(PHONE.width);
  }
  for (const option of await list.getByRole('option').all()) {
    const text = option.locator('span').first();
    expect(await text.evaluate((el) => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
    await expect(option).toContainText('% mined');
    await expect(option).toContainText('EVE');
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth
    )
  ).toBe(true);

  await removes.first().click();
  // One survey left: nothing to switch to, so the picker goes away without having switched.
  await expect(picker).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Mining Survey' })).toBeVisible();
});
