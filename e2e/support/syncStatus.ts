import type { Page } from '@playwright/test';

/**
 * Opens the sync-configured gate for this page only (dev server only: it
 * swaps the source module). Both of the module's runtime exports, so every
 * importer still gets the module it asked for — only the answer changes.
 */
export async function stubSyncConfigured(page: Page): Promise<void> {
  await page.route('**/src/app/syncStatus.ts*', async (route) => {
    await route.fulfill({
      contentType: 'text/javascript',
      body: [
        'export function isSyncConfigured() { return true; }',
        'export function syncDisplayState(status, online) {',
        "  return online ? status.state : 'offline';",
        '}',
        '',
      ].join('\n'),
    });
  });
}
