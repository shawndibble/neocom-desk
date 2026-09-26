/**
 * Asserts the page itself never scrolls sideways — the failure mode a
 * phone-width (390px) layout bug tends to produce (#1708): one clipped or
 * zero-width element widens `<html>` past the viewport and every table on
 * the page picks up a horizontal scrollbar, not just the offending one.
 */
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function expectNoPageOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
}
