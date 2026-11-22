import type { Page } from '@playwright/test';

/**
 * Presses a secondary action of a Payee card on the Tax tab ("Ledger", "Link payment"): the text
 * action beside Settle up from `sm` up, the card's ⋮ menu item on a phone.
 */
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
  if (await direct.first().isVisible()) {
    await direct.first().click();
    return;
  }
  await scope
    .getByRole('button', { name: /^More actions for / })
    .first()
    .click();
  await page.getByRole('menuitem', { name: action }).click();
}
