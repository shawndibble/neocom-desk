/** Answers "Open market in EVE" (POST /ui/openwindow/marketdetails) with 204 so no error shows. */
import type { Page } from '@playwright/test';

export async function installOpenWindow(page: Page): Promise<void> {
  await page.route('https://esi.evetech.net/**/ui/openwindow/**', (route) =>
    route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' }, body: '' })
  );
}
