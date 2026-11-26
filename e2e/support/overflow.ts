import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function expectNoPageOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
}

export const scrollerFit = (el: Locator) =>
  el.evaluate((node) => {
    let n = node.parentElement;
    while (n && !/auto|scroll/.test(getComputedStyle(n).overflowX)) n = n.parentElement;
    if (!n) return null;
    return {
      scrollWidth: n.scrollWidth,
      clientWidth: n.clientWidth,
      right: n.getBoundingClientRect().right,
    };
  });

export const panelRight = (el: Locator) =>
  el.evaluate((node) => {
    let n = node.parentElement;
    while (n && parseFloat(getComputedStyle(n).borderRightWidth) === 0) n = n.parentElement;
    return n ? n.getBoundingClientRect().right : null;
  });
