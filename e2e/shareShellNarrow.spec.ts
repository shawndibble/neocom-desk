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
  await expect(choose).toBeVisible({ timeout: 15_000 });

  const [headerBox, loginBox, chooseBox] = await Promise.all([
    header.boundingBox(),
    login.boundingBox(),
    choose.boundingBox(),
  ]);
  expect(chooseBox!.height).toBeGreaterThanOrEqual(24);
  expect(chooseBox!.y).toBeGreaterThanOrEqual(loginBox!.y + loginBox!.height - 0.5);
  expect(chooseBox!.y + chooseBox!.height).toBeLessThanOrEqual(
    headerBox!.y + headerBox!.height + 4
  );
});
