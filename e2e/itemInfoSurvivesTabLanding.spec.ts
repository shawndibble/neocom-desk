import { test, expect } from './support/testBase';
import { signInAndGoto } from './support/authSeed';

test('a cold ?info= link to a bare tabbed path keeps its modal through the tab landing', async ({
  page,
}) => {
  const history = [3, 2, 1].map((daysAgo) => ({
    date: new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10),
    average: 5,
    highest: 6,
    lowest: 4,
    order_count: 10,
    volume: 1000,
  }));
  await page.route(/https:\/\/esi\.evetech\.net\/markets\/\d+\/history/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(history) })
  );
  await page.route(/https:\/\/esi\.evetech\.net\/markets\/\d+\/orders/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  );
  await signInAndGoto(page, './market?info=type-34');

  const modal = page.getByRole('dialog');
  await expect(modal).toBeVisible({ timeout: 15_000 });
  await expect(
    page
      .getByRole('tablist', { name: 'Market' })
      .getByRole('tab', { name: 'Market', selected: true })
  ).toBeAttached({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/market\/browser\?.*info=type-34/);
  await expect(modal).toBeVisible();

  await modal.getByRole('tab', { name: 'Market' }).click();
  await modal.getByRole('combobox', { name: 'Range' }).click();
  await page.getByRole('option', { name: '90 days' }).click();

  await expect(modal.getByRole('combobox', { name: 'Range' })).toHaveText(/90 days/);
  await expect(modal).toBeVisible();
  await expect(page).toHaveURL(/info=type-34/);
});
