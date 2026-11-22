/**
 * The Share Link header at 390px, signed out: the quiet "Choose permissions"
 * button under Log in keeps a 24px hit area (WCAG 2.5.8, DESIGN.md §3) without
 * growing the header or overlapping the Log in button above it (#6670).
 *
 * The share document is missing, so the page renders the expired state; the
 * header is the same. Playwright rather than jsdom: padding and negative
 * margins are layout a real engine has to evaluate.
 */
import { test, expect, PHONE } from './support/testBase';

test('Choose permissions is a 24px target that does not overlap Log in at 390px', async ({
  page,
}) => {
  await page.route(/firestore\.googleapis\.com\/.*documents:batchGet/, async (route) => {
    const request = route.request().postDataJSON() as { documents: string[] };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ missing: request.documents[0], readTime: new Date().toISOString() }]),
    });
  });
  await page.setViewportSize(PHONE);
  await page.goto('./s/e2eShellNarrow');

  const header = page.getByRole('banner').first();
  const login = header.getByRole('button', { name: 'Log in' });
  const choose = header.getByRole('button', { name: 'Choose permissions' });
  // Both render only once the character count resolves, so the loading state is not measured.
  await expect(choose).toBeVisible({ timeout: 15_000 });

  const [headerBox, loginBox, chooseBox] = await Promise.all([
    header.boundingBox(),
    login.boundingBox(),
    choose.boundingBox(),
  ]);
  expect(chooseBox!.height).toBeGreaterThanOrEqual(24);
  expect(chooseBox!.y).toBeGreaterThanOrEqual(loginBox!.y + loginBox!.height - 0.5);
  // The hit area grows inside the header's existing height, not beyond it.
  expect(chooseBox!.y + chooseBox!.height).toBeLessThanOrEqual(
    headerBox!.y + headerBox!.height + 4
  );
});
