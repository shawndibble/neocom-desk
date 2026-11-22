/**
 * Asserts the page itself never scrolls sideways — the failure mode a
 * phone-width (390px) layout bug tends to produce (#1708): one clipped or
 * zero-width element widens `<html>` past the viewport and every table on
 * the page picks up a horizontal scrollbar, not just the offending one.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from '@playwright/test';

export async function expectNoPageOverflow(page: Page): Promise<void> {
  const doc = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
}

/** Fit metrics of the nearest ancestor of `el` that scrolls on x, or null when none does. */
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

/** Right edge of the nearest bordered ancestor of `el`: the Panel it sits in. */
export const panelRight = (el: Locator) =>
  el.evaluate((node) => {
    let n = node.parentElement;
    while (n && parseFloat(getComputedStyle(n).borderRightWidth) === 0) n = n.parentElement;
    return n ? n.getBoundingClientRect().right : null;
  });
