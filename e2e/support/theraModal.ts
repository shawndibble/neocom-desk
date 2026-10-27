/**
 * Opens Route Safety's Thera / Turnur modal: unfolds the Route rules panel on a
 * phone, opens "More route options", then presses "Browse open wormholes".
 */
import type { Page } from '@playwright/test';

export async function openTheraModal(page: Page, { phone = false } = {}) {
  const timeout = { timeout: 20_000 };
  if (phone) await page.getByRole('button', { name: 'Show route rules' }).click(timeout);
  const more = page.getByRole('button', { name: /^More route options/ });
  await more.waitFor(timeout);
  if ((await more.getAttribute('aria-expanded')) === 'false') await more.click();
  await page.getByRole('button', { name: 'Browse open wormholes' }).click(timeout);
  const dialog = page.getByRole('dialog', { name: 'Thera / Turnur' });
  await dialog.waitFor(timeout);
  return dialog;
}
