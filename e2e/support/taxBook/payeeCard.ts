import { expect, type Page } from '@playwright/test';

export async function pressCardAction(
  page: Page,
  action: 'Ledger' | 'Link payment',
  payee?: string
): Promise<void> {
  const scope = payee
    ? page.getByRole('group', { name: payee })
    : page.getByRole('region', { name: 'You owe' });
  const direct =
    action === 'Ledger'
      ? scope.getByRole('button', { name: /^Open the ledger of / })
      : scope.getByRole('button', { name: 'Link payment', exact: true });
  const more = scope.getByRole('button', { name: /^More actions for / }).first();
  await expect
    .poll(async () => (await direct.first().isVisible()) || (await more.isVisible()))
    .toBe(true);
  if (await direct.first().isVisible()) {
    await direct.first().click();
    return;
  }
  await more.click();
  await page.getByRole('menuitem', { name: action }).click();
}
